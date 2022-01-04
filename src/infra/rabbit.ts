import { Logger } from "winston"
import { ConfirmChannel, connect, Connection, ConsumeMessage, Message } from "amqplib"
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

export class Rabbit {
  private connection: Connection | null = null
  private channel: ConfirmChannel | null = null
  private exchangeName = "events"
  private waiting = false
  private stopping = false
  constructor(
    private readonly uri: string,
    readonly msName: string,
    private prefetch: number,
    private logger: Logger
  ) {}

  async connect() {
    try {
      this.logger.info("Start to connect to rabbit ...")
      this.stopping = false
      this.connection = await connect(this.uri)
      this.connection.on("error", async (err) => {
        const timeout = random(5000)
        this.logger.error(`Connection with rabbit closed with ${inspect(err)} try to reconnect in ${timeout} ms`)
        this.scheduleReconnection(timeout)
      })
      this.connection.on("close", async (reason) => {
        const timeout = random(5000)
        this.logger.info(`Connection with rabbit closed with ${inspect(reason)} try to reconnect in ${timeout} ms`)
        this.scheduleReconnection(timeout)
      })
      await this.createChannel(this.connection)
      await this.setupExchanges()
      // await this.setupQueues()
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
  }

  async startConsumer(consumer: RabbitConsumerCallBack, opts: RabbitConsumerOptions) {
    if (!this.channel) throw new Error("Unable to start consumer because connection is null")
    await this.channel.assertQueue(opts.queueName, {
      exclusive: opts.temporary,
      durable: !opts.temporary,
      autoDelete: opts.temporary,
    })

    await this.channel.bindQueue(opts.queueName, opts.exchange, opts.bindingKey)
    await this.channel.consume(opts.queueName, async (msg) => {
      try {
        await this.handleMessage(msg, consumer)
      } catch (error) {
        this.logger.error(`Unable to handle message ${inspect(msg)} with consumer: ${inspect(opts)}`)
      }
    })
  }

  ack(msg: Message) {
    if (!this.channel) throw new Error(`Unable to ack message ${inspect(msg)} because connection is null`)
    this.channel.ack(msg)
  }

  nack(msg: Message, { requeue }: { requeue: boolean }) {
    if (!this.channel) throw new Error(`Unable to nack message ${inspect(msg)} because connection is null`)
    this.channel.nack(msg, false, requeue)
  }

  async getInfo() {
    try {
      await this.channel?.checkExchange(this.exchangeName)
      const exchanges = [this.exchangeName]
      const queues: string[] = [] //[await this.channel?.checkQueue(this.queueName)]
      return { exchanges, queues, serverProperties: this.connection?.connection.serverProperties }
    } catch (error) {
      return { error: inspect(error) }
    }
  }
  // TODO it's too specific!!!
  publish(message: RabbitMessage): Promise<void> {
    if (!this.channel) throw new Error("Unable to publish because connection is null")
    const content: Buffer = Buffer.from(JSON.stringify(message))
    this.channel.publish(this.exchangeName, `event.${this.msName}.${message.eventName}`, content, {
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

    // const rabbitMessage = JSON.parse(msg.content.toString()) as RabbitMessage
    return cb(msg)
  }

  private scheduleReconnection(timeout: number) {
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
        await this.connect()
      } catch (error) {
        const t = random(5000)
        this.logger.error(`Unable to connect with rabbit, schedule a new connection in ${timeout} msec`)
        this.scheduleReconnection(t)
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

  private setupExchanges() {
    return this.channel?.assertExchange(this.exchangeName, "topic", {
      durable: true,
      alternateExchange: "dead_letter_exchange",
    })
  }

  // private setupQueues() {
  //   return this.channel?.assertQueue(this.queueName, {
  //     exclusive: this.tmpQueue ? true : false,
  //     durable: this.tmpQueue ? false : true,
  //     // autoDelete?: boolean | undefined;
  //     // arguments?: any;
  //     // messageTtl?: number | undefined;
  //     // expires?: number | undefined;
  //     deadLetterExchange: "dead_letter_exchange",
  //     // deadLetterRoutingKey?: string | undefined;
  //     // maxLength?: number | undefined;
  //     // maxPriority?: number | undefined;
  //   })
  // }
}
