import { configureLogger } from "../../src/app"
import { Rabbit, RabbitGetInfo } from "../../src/infra/rabbit"
import { createEventBuilderFor, RabbitServiceBus } from "../../src/infra/rabbit_service_bus"
import { EmailConfirmed, UserCreated } from "../../src/user/user"
import { getTestOptions } from "../support/test_app"
import { AssertionError, expect } from "chai"
import { randomUUID } from "crypto"
import { eventually, expectThrowsAsync } from "../support/expect_util"
import { inspect } from "util"
import { validateEmailConfirmedPayload, validateUserCreatedPayload } from "../../src/user/validation"
import { connect } from "amqplib"
import { wait } from "../../src/infra/wait"
import { faker } from "@faker-js/faker"

describe("RabbitEventBus", () => {
  const opts = getTestOptions()
  const logger = configureLogger(opts.logger)
  const rabbit = new Rabbit(opts.rabbitOptions.uri, "ms_temp", 50, logger)
  let rabbitServiceBus: RabbitServiceBus

  beforeEach(async () => {
    rabbitServiceBus = new RabbitServiceBus(rabbit, "ms_temp", logger)
    await rabbit.connect({ temporary: opts.rabbitOptions.tmpQueue })
    await clearDLQ(rabbit, opts.rabbitOptions.uri)
  })
  afterEach(() => rabbit.disconnect())

  it("when handler return ack then ack message", async () => {
    const events: EmailConfirmed[] = []
    rabbitServiceBus.register(EmailConfirmed.EventName, async (e: EmailConfirmed) => {
      events.push(e)
      return { ack: true, payload: "test" }
    })
    await rabbitServiceBus.start(
      [createEventBuilderFor(validateEmailConfirmedPayload, EmailConfirmed)],
      opts.rabbitOptions.tmpQueue
    )
    const event = EmailConfirmed.create({ userId: randomUUID(), email: "a@a.it" })

    await rabbitServiceBus.emit(event)

    await eventually(() => expect(events).lengthOf(1))
    const info = (await rabbit.getInfo()) as RabbitGetInfo
    const queueInfo = getQueueInfoOf(info, EmailConfirmed.EventName)
    expect(queueInfo.messageCount).eql(0)
  })

  it("when handler return nack then nack message and DON'T reenqueue it", async () => {
    const events: EmailConfirmed[] = []
    rabbitServiceBus.register(EmailConfirmed.EventName, async (e: EmailConfirmed) => {
      events.push(e)
      return { ack: false, payload: "test" }
    })
    await rabbitServiceBus.start(
      [createEventBuilderFor(validateEmailConfirmedPayload, EmailConfirmed)],
      opts.rabbitOptions.tmpQueue
    )
    const event = EmailConfirmed.create({ userId: randomUUID(), email: faker.internet.email() })

    await rabbitServiceBus.emit(event)

    await eventually(async () => {
      const info = (await rabbit.getInfo()) as RabbitGetInfo
      const queueInfo = getQueueInfoOf(info, EmailConfirmed.EventName)
      expect(queueInfo.messageCount).eql(0)
    })
    expect(events).lengthOf(1)
    await eventually(async () => {
      const dlqInfo = await rabbit.getDLQQueueInfo()
      expect(dlqInfo.messageCount).gte(1)
    })
  })

  it("when handler raise exception then nack and reenqueue message first time", async () => {
    const { messageCount } = await rabbit.getDLQQueueInfo()
    expect(messageCount).eql(0)
    const events: EmailConfirmed[] = []
    rabbitServiceBus.register(EmailConfirmed.EventName, async (e: EmailConfirmed) => {
      events.push(e)
      throw new Error("Error !!!")
    })
    await rabbitServiceBus.start(
      [createEventBuilderFor(validateEmailConfirmedPayload, EmailConfirmed)],
      opts.rabbitOptions.tmpQueue
    )
    const event = EmailConfirmed.create({ userId: randomUUID(), email: "a@a.it" })

    await rabbitServiceBus.emit(event)

    await eventually(async () => {
      const info = (await rabbit.getInfo()) as RabbitGetInfo
      const queueInfo = getQueueInfoOf(info, EmailConfirmed.EventName)
      expect(queueInfo.messageCount).eql(0)
    })
    expect(events).lengthOf(2)
    await eventually(async () => {
      const dlqInfo = await rabbit.getDLQQueueInfo()
      expect(dlqInfo.messageCount).gte(1)
    })
  })

  it("raise exception if handler is already registered", () => {
    rabbitServiceBus.register(UserCreated.EventName, () => Promise.resolve({ ack: true, payload: "" }))
    expect(() => {
      rabbitServiceBus.register(UserCreated.EventName, () => Promise.resolve({ ack: true, payload: "" }))
    }).throws(`${UserCreated.EventName} is already registered!`)
  })

  it("create queue when start serviceBus", async () => {
    rabbitServiceBus.register(UserCreated.EventName, () => Promise.resolve({ ack: true, payload: "" }))

    await rabbitServiceBus.start(
      [createEventBuilderFor(validateUserCreatedPayload, UserCreated)],
      opts.rabbitOptions.tmpQueue
    )

    const info = (await rabbit.getInfo()) as RabbitGetInfo
    const queueInfo = getQueueInfoOf(info, UserCreated.EventName)
    expect(queueInfo.queue).eql(`ms_temp_${UserCreated.EventName}_tmp`)
  })

  it("raise exception if we don't have enough handlers for builders", async () => {
    rabbitServiceBus.register(UserCreated.EventName, () => Promise.resolve({ ack: true, payload: "" }))

    await expectThrowsAsync(
      () =>
        rabbitServiceBus.start(
          [
            createEventBuilderFor(validateUserCreatedPayload, UserCreated),
            createEventBuilderFor(validateEmailConfirmedPayload, EmailConfirmed),
          ],
          opts.rabbitOptions.tmpQueue
        ),
      Error
    )
  })
})

async function clearDLQ(rabbit: Rabbit, uri: string) {
  for (let i = 0; i < 3; i++) {
    const info = await rabbit.getDLQQueueInfo()
    const connection = await connect(uri)
    const ch = await connection.createChannel()
    await ch.purgeQueue(info.queue)
    const { messageCount } = await rabbit.getDLQQueueInfo()
    expect(messageCount).eql(0)
    await ch.close()
    await connection.close()
    await wait(100)
  }
}

function getQueueInfoOf(info: RabbitGetInfo, eventName: string) {
  const queueInfo = info.queues.find((q) => q.queue.includes(eventName))
  if (!queueInfo) throw new AssertionError(`Unable to find ${eventName} in ${inspect(info)}`)
  return queueInfo
}
