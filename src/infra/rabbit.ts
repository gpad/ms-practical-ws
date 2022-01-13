import { Logger } from "winston"
import { ConfirmChannel, connect, Connection, ConsumeMessage, Message, Replies, ServerProperties } from "amqplib"
import { random } from "lodash"
import { inspect } from "util"
import { wait } from "./wait"

export interface RabbitMessage {
  eventName: string
  messageId: string
  correlationId: string
  causationId: string
  aggregateVersion: number
  aggregateVersionIndex: number
  payload: unknown
}

type RabbitConsumerCallBack = (m: ConsumeMessage) => Promise<void>

interface RabbitConsumerOptions {
  queueName: string
  bindingKey: string
  exchange: string
  temporary: boolean
}

export interface RabbitGetInfo {
  exchanges: string[]
  queues: Replies.AssertQueue[]
  serverProperties: ServerProperties
}

const DeadLetterExchange = "dead_letter_exchange"
const EventsExchange = "events"

export class Rabbit {
  private connection: Connection | null = null
  private channel: ConfirmChannel | null = null
  private waiting = false
  private stopping = false
  private consumers: string[] = []
  private deadLetterQueueName?: string
  constructor(
    private readonly uri: string,
    readonly msName: string,
    private prefetch: number,
    private logger: Logger
  ) {}

  async connect({ temporary }: { temporary: boolean }) {
    try {
      this.logger.info("Start to connect to rabbit ...")
      this.stopping = false
      this.connection = await connect(this.uri)
      this.connection.on("error", async (err) => {
        const timeout = random(5000)
        this.logger.error(`Connection with rabbit closed with ${inspect(err)} try to reconnect in ${timeout} ms`)
        this.scheduleReconnection(timeout, temporary)
      })
      this.connection.on("close", async (reason) => {
        const timeout = random(5000)
        this.logger.info(`Connection with rabbit closed with ${inspect(reason)} try to reconnect in ${timeout} ms`)
        this.scheduleReconnection(timeout, temporary)
      })
      await this.createChannel(this.connection)
      await this.setupExchanges()
      await this.setupDLQ({ temporary })
      this.logger.info("Connection with rabbit executed!!!")
    } catch (error) {
      this.logger.error(`Error connection to ${this.uri} ${inspect(error)}`)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.stopping = true
    await this.channel?.close()
    await this.connection?.close()
    this.consumers = []
  }

  async startConsumer(consumer: RabbitConsumerCallBack, opts: RabbitConsumerOptions) {
    if (!this.channel) {
      throw new Error("Unable to start consumer because channel is null")
    }
    await this.channel.assertQueue(opts.queueName, {
      exclusive: opts.temporary,
      durable: !opts.temporary,
      autoDelete: opts.temporary,
      deadLetterExchange: DeadLetterExchange,
    })

    await this.channel.bindQueue(opts.queueName, opts.exchange, opts.bindingKey)
    await this.channel.consume(opts.queueName, async (msg) => {
      try {
        await this.handleMessage(msg, consumer)
      } catch (error) {
        this.logger.error(`Unable to handle message ${inspect(msg)} with consumer: ${inspect(opts)}`)
      }
    })
    this.consumers.push(opts.queueName)
  }

  ack(msg: Message) {
    if (!this.channel) {
      throw new Error(`Unable to ack message ${inspect(msg)} because channel is null`)
    }
    this.channel.ack(msg)
  }

  nack(msg: Message, { requeue }: { requeue: boolean }) {
    if (!this.channel) {
      throw new Error(`Unable to nack message ${inspect(msg)} because channel is null`)
    }
    this.channel.nack(msg, false, requeue)
  }

  async getInfo(): Promise<RabbitGetInfo | { error: string }> {
    if (!this.connection) {
      throw new Error("Unable to getInfo because connection is null")
    }
    if (!this.channel) {
      throw new Error("Unable to getInfo because channel is null")
    }
    try {
      await this.channel.checkExchange(EventsExchange)
      const exchanges = [EventsExchange]
      const ch = this.channel
      const queues = await Promise.all(this.consumers.map((q) => ch.checkQueue(q)))
      return { exchanges, queues, serverProperties: this.connection.connection.serverProperties }
    } catch (error) {
      return { error: inspect(error) }
    }
  }

  getDLQQueueInfo() {
    if (!this.channel) {
      throw new Error("Unable to getInfo because channel is null")
    }
    if (!this.deadLetterQueueName) {
      throw new Error("Unable to getInfo because deadLetterQueueName was not created")
    }
    return this.channel.checkQueue(this.deadLetterQueueName)
  }

  // TODO it's too specific!!!
  publish(message: RabbitMessage): Promise<void> {
    if (!this.channel) {
      throw new Error("Unable to publish because connection is null")
    }
    const content: Buffer = Buffer.from(JSON.stringify(message))
    this.channel.publish(EventsExchange, `event.${this.msName}.${message.eventName}`, content, {
      appId: this.msName,
      messageId: message.messageId,
      correlationId: message.correlationId,
      persistent: true,
    })
    return Promise.resolve(this.channel.waitForConfirms())
  }

  private handleMessage(msg: ConsumeMessage | null, cb: RabbitConsumerCallBack): Promise<void> {
    if (!msg) {
      this.logger.warn("Consumed a null message")
      return Promise.resolve()
    }
    return cb(msg)
  }

  private scheduleReconnection(timeout: number, temporary: boolean) {
    if (this.stopping) {
      this.logger.info("Don't reschedule connection because we are stopping")
      return
    }
    if (this.waiting) {
      this.logger.warn("Reconnection already scheduled")
      return
    }
    this.waiting = true
    setTimeout(async () => {
      this.waiting = false
      try {
        await this.connect({ temporary })
      } catch (error) {
        const t = random(5000)
        this.logger.error(`Unable to connect with rabbit, schedule a new connection in ${timeout} msec`)
        this.scheduleReconnection(t, temporary)
      }
    }, timeout)
  }

  private async createChannel(connection: Connection) {
    this.channel = await connection.createConfirmChannel()
    await this.channel.prefetch(this.prefetch)
    this.channel.on("error", async (err) => {
      const timeout = random(5000)
      this.logger.error(`Channel with rabbit closed with ${inspect(err)} try to recreate in ${timeout} ms`)
      await wait(timeout)
      await this.createChannel(connection)
    })
  }

  private async setupExchanges() {
    if (!this.channel) {
      throw new Error("Unable to setup exchange because channel is null")
    }
    await this.channel.assertExchange(DeadLetterExchange, "topic", { durable: true })
    await this.channel.assertExchange(EventsExchange, "topic", {
      durable: true,
      alternateExchange: DeadLetterExchange,
    })
  }

  private async setupDLQ({ temporary }: { temporary: boolean }) {
    if (!this.channel) {
      throw new Error("Unable to setup exchange because channel is null")
    }
    this.deadLetterQueueName = `dead_letter_queue${temporary ? "_tmp" : ""}`
    await this.channel.assertQueue(this.deadLetterQueueName, { durable: !temporary, autoDelete: temporary })
    await this.channel.bindQueue(this.deadLetterQueueName, DeadLetterExchange, "#")
  }
}
