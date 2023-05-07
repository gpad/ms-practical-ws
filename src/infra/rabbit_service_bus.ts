import { AggregateVersion, DomainEvent, PublicDomainEvent } from "./aggregate"
import { Rabbit, RabbitMessage } from "./rabbit"
import { EventBus, EventHandler, toMessage } from "./event_bus"
import { isEmpty, snakeCase } from "lodash"
import { Logger } from "winston"
import { ConsumeMessage } from "amqplib"
import { CausationId, CorrelationId, EventId } from "./ids"
import { DomainTrace } from "./domain_trace"
import { inspect } from "util"
import { elapsedFrom, wait } from "./wait"
import { ValidateFunction } from "ajv"

function partitionPublicEvents<T extends DomainEvent>(events: T[]): [PublicDomainEvent[], DomainEvent[]] {
  function isPublicDomainEvent(e: unknown): e is PublicDomainEvent {
    return e instanceof PublicDomainEvent
  }
  const publicEvents: PublicDomainEvent[] = []
  const domainEvents: DomainEvent[] = []
  for (const event of events) {
    if (isPublicDomainEvent(event)) {
      publicEvents.push(event)
    } else {
      domainEvents.push(event)
    }
  }

  return [publicEvents, domainEvents]
}

type PublicDomainEventCtor<T, U extends PublicDomainEvent> = {
  new (eventId: EventId, payload: T, aggregateVersion: AggregateVersion, domainTrace: DomainTrace): U
  EventName: string
}

interface ReceivedMessage {
  causationId: string
  correlationId: string
  payload: unknown
  messageId: string
  aggregateVersion: number
  aggregateVersionIndex: number
}

export interface PublicDomainEventBuilder<T extends PublicDomainEvent> {
  createFromMessage(msg: ReceivedMessage): T
  isAbleToManage(eventName: string): boolean
  getEventName(): string
}

export class GenericPublicDomainEventBuilder<T, U extends PublicDomainEvent> implements PublicDomainEventBuilder<U> {
  constructor(private validation: ValidateFunction<T>, private MessageType: PublicDomainEventCtor<T, U>) {}

  getEventName(): string {
    return this.MessageType.EventName
  }

  createFromMessage(msg: ReceivedMessage): U {
    if (!this.validation(msg.payload)) {
      throw new Error(`Unable to verify msg: ${inspect(msg)} because: ${inspect(this.validation.errors)}`)
    }
    const eventId = EventId.from(msg.messageId)
    const domainTrace = new DomainTrace(CorrelationId.from(msg.correlationId), CausationId.from(msg.causationId))
    return new this.MessageType(eventId, msg.payload, AggregateVersion.from(msg), domainTrace)
  }

  isAbleToManage(eventName: string): boolean {
    return this.MessageType.EventName === eventName
  }
}

export function createEventBuilderFor<T, U extends PublicDomainEvent>(
  validation: ValidateFunction<T>,
  messageClass: PublicDomainEventCtor<T, U>
) {
  return new GenericPublicDomainEventBuilder(validation, messageClass)
}

export class RabbitServiceBus implements EventBus {
  private handlers: { [key: string]: EventHandler<never> } = {}
  private pendingLocalEvents: DomainEvent[] = []
  private executingLocalEvents = false

  constructor(private readonly rabbit: Rabbit, private msName: string, private logger: Logger) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async start(builders: PublicDomainEventBuilder<any>[], temporary: boolean): Promise<void> {
    const eventNames = builders.map((b) => b.getEventName())
    const handlerNames = Object.keys(this.handlers)
    const everyBuildersHaveHandlers = eventNames.every((e) => handlerNames.find((h) => h === e))
    if (!everyBuildersHaveHandlers) {
      throw new Error(`Some builders doesn't have an handler, builders: ${eventNames}, handlers: ${handlerNames}`)
    }
    await Promise.all(eventNames.map((eventName, index) => this.createConsumer(eventName, builders[index], temporary)))
  }

  async stop(): Promise<void> {
    await this.waitPendingExecutions()
    this.handlers = {}
    this.pendingLocalEvents.splice(0)
  }

  emit<T extends DomainEvent>(event: T): Promise<void> {
    if (event instanceof PublicDomainEvent) {
      return this.rabbit.publish(toMessage(event))
    }

    this.pendingLocalEvents.push(event)
    setImmediate(() => this.executePendingEvents())
    return Promise.resolve()
  }

  emits<T extends DomainEvent>(events: T[]): Promise<void> {
    const [publicEvents, localEvents] = partitionPublicEvents(events)
    this.pendingLocalEvents.push(...localEvents)
    setImmediate(() => this.executePendingEvents())
    return this.rabbit.publishAll(publicEvents.map(toMessage))
  }

  register<T extends DomainEvent>(eventName: string, handler: EventHandler<T>): void {
    if (this.alreadyRegister(eventName)) throw new Error(`${eventName} is already registered!`)
    this.handlers[eventName] = handler
  }

  async waitPendingExecutions() {
    if (isEmpty(this.pendingLocalEvents)) return
    while (!isEmpty(this.pendingLocalEvents)) {
      await wait(0)
    }
  }

  private createConsumer<T extends PublicDomainEvent>(
    eventName: string,
    builder: PublicDomainEventBuilder<T>,
    temporary: boolean
  ): Promise<void> {
    return this.rabbit.startConsumer(
      (msg) => {
        return this.handleMessage<T>(msg, this.handlers[eventName] as EventHandler<T>, builder)
      },
      {
        queueName: this.createQueueNameFrom(eventName, temporary),
        bindingKey: `event.*.${eventName}`,
        exchange: "events",
        temporary,
      }
    )
  }

  private async handleMessage<T extends PublicDomainEvent>(
    msg: ConsumeMessage,
    handler: EventHandler<T>,
    builder: PublicDomainEventBuilder<T>
  ): Promise<void> {
    const start = Date.now()
    try {
      const rabbitMessage = JSON.parse(msg.content.toString()) as RabbitMessage
      const receivedMessage: ReceivedMessage = rabbitMessage
      const event = builder.createFromMessage(receivedMessage)
      const logger = this.createLoggerFrom<T>(event)
      const ret = await handler(event, logger)
      logger.info(`Executed event: ${inspect(event)} in ${elapsedFrom(start)} ms, ret: ${inspect(ret)}`)

      if (ret.ack) {
        this.rabbit.ack(msg)
        logger.info(`ACK event: ${inspect(event)}`)
      } else {
        this.rabbit.nack(msg, { requeue: false })
        logger.warn(`NACK event: ${inspect(event)}`)
      }
    } catch (error) {
      this.logger.error(`Unable to handle message ${inspect(msg)} error: ${inspect(error)}`)
      this.rabbit.nack(msg, { requeue: !msg.fields.redelivered })
    }
  }

  private createLoggerFrom<T extends DomainEvent>(event: T) {
    return this.logger.child({
      domainTrace: {
        correlationId: event.domainTrace.correlationId.toValue(),
        causationId: event.domainTrace.causationId.toValue(),
        eventId: event.id.toValue(),
        eventName: event.eventName,
        aggregateId: event.aggregateId,
        aggregateVersion: event.aggregateVersion.version,
        aggregateVersionIndex: event.aggregateVersion.index,
      },
    })
  }

  private createQueueNameFrom(eventName: string, temporary: boolean): string {
    return `${snakeCase(this.msName)}_${snakeCase(eventName)}${temporary ? "_tmp" : ""}`
  }

  private alreadyRegister(commandName: string) {
    return !!this.handlers[commandName]
  }

  private async executePendingEvents(): Promise<void> {
    if (this.executingLocalEvents) {
      return
    }
    this.executingLocalEvents = true
    while (this.pendingLocalEvents.length) {
      const events = this.pendingLocalEvents.splice(0)
      await Promise.all(events.map((e) => this.dispatchLocalEvent(e)))
    }
    this.executingLocalEvents = false
  }

  private async dispatchLocalEvent<T extends DomainEvent>(event: T) {
    let count = 0
    const start = Date.now()
    const logger = this.createLoggerFrom<T>(event)
    const handler = this.handlers[event.eventName] as EventHandler<T>
    if (!handler) {
      this.logger.error(`Unable to find handler for event: ${event.eventName}`)
      return
    }
    while (count < 3) {
      try {
        const ret = await handler(event, logger)
        logger.info(`Executed event: ${inspect(event)} in ${elapsedFrom(start)} ms, ret: ${inspect(ret)}`)

        if (ret.ack) {
          logger.info(`ACK local event: ${inspect(event)}`)
          return
        }
        logger.warn(`NACK local event: ${inspect(event)}`)
      } catch (error) {
        logger.warn(`NACK local event: ${inspect(event)} - ${inspect(error)}`, error)
      }
      count += 1
    }
  }
}
