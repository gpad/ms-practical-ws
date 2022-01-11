import { AggregateVersion, DomainEvent, PublicDomainEvent } from "./aggregate"
import { Rabbit, RabbitMessage } from "./rabbit"
import { EventBus, EventHandler, toMessage } from "./event_bus"
import { snakeCase } from "lodash"
import { Logger } from "winston"
import { ConsumeMessage } from "amqplib"
import { CausationId, CorrelationId, EventId } from "./ids"
import { DomainTrace } from "./domain_trace"
import { inspect } from "util"
import { elapsedFrom } from "./wait"

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
  constructor(private record: unknown, private MessageType: PublicDomainEventCtor<T, U>) {
    // TODO how to check type
    if (!this.record) throw Error("todo")
  }

  getEventName(): string {
    return this.MessageType.EventName
  }

  createFromMessage(msg: ReceivedMessage): U {
    // checkRuntype(this.record, msg.payload)
    const eventId = EventId.from(msg.messageId)
    // const domainTrace = DomainTrace.extractFromMessage(msg)
    const domainTrace = new DomainTrace(CorrelationId.from(msg.correlationId), CausationId.from(msg.causationId))
    return new this.MessageType(eventId, msg.payload as T, AggregateVersion.from(msg), domainTrace)
  }

  isAbleToManage(eventName: string): boolean {
    return this.MessageType.EventName === eventName
  }
}

export function createEventBuilderFor<T, U extends PublicDomainEvent>(
  // record: Runtype<T>,
  record: unknown,
  messageClass: PublicDomainEventCtor<T, U>
) {
  return new GenericPublicDomainEventBuilder(record, messageClass)
}

export class RabbitServiceBus implements EventBus {
  private handlers: { [key: string]: EventHandler<never> } = {}

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
      // const event = createEventFrom<T>(msg)
      const event = builder.createFromMessage(receivedMessage)
      const logger = this.logger.child({
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
      const ret = await handler(event, logger)
      logger.info(`Executed event: ${inspect(event)} in ${elapsedFrom(start)} ms, ret: ${inspect(ret)}`)
      logger.info(`Executed event: ${inspect(event)} in ${elapsedFrom(start)} m.`)

      if (ret.ack) {
        this.rabbit.ack(msg)
      } else {
        this.rabbit.nack(msg, { requeue: false })
      }
    } catch (error) {
      this.logger.error(`Unable to handle message ${inspect(msg)} error: ${inspect(error)}`)
      this.rabbit.nack(msg, { requeue: !msg.fields.redelivered })
    }
  }

  private createQueueNameFrom(eventName: string, temporary: boolean): string {
    return `${snakeCase(this.msName)}_${snakeCase(eventName)}${temporary ? "_tmp" : ""}`
  }

  emit<T extends DomainEvent>(event: T): Promise<void> {
    if (event instanceof PublicDomainEvent) {
      return this.rabbit.publish(toMessage(event))
    }
    return Promise.reject()
  }

  register<T extends DomainEvent>(eventName: string, handler: EventHandler<T>): void {
    if (this.alreadyRegister(eventName)) throw new Error(`${eventName} is already registered!`)
    this.handlers[eventName] = handler
  }

  private alreadyRegister(commandName: string) {
    return !!this.handlers[commandName]
  }
}
