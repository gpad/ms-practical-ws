import { configureLogger } from "../../src/app"
import { Rabbit, RabbitGetInfo } from "../../src/infra/rabbit"
import { createEventBuilderFor, RabbitServiceBus } from "../../src/infra/rabbit_service_bus"
import { EmailConfirmed, UserCreated } from "../../src/user/user"
import { getTestOptions } from "../support/test_app"
import { AssertionError, expect } from "chai"
import { randomUUID } from "crypto"
import { eventually, expectThrowsAsync } from "../support/expect_util"
import { inspect } from "util"

describe("RabbitEventBus", () => {
  const opts = getTestOptions()
  const logger = configureLogger(opts.logger)
  const rabbit = new Rabbit(opts.rabbitOptions.uri, "ms_temp", 50, logger)
  let rabbitServiceBus: RabbitServiceBus

  beforeEach(() => {
    rabbitServiceBus = new RabbitServiceBus(rabbit, "ms_temp", logger)
    return rabbit.connect()
  })
  // beforeEach(() => rabbitServiceBus.start([createEventBuilderFor("_", EmailConfirmed)], opts.rabbitOptions.tmpQueue))
  afterEach(() => rabbit.disconnect())

  it("when handler return ack then ack message", async () => {
    const events: EmailConfirmed[] = []
    rabbitServiceBus.register(EmailConfirmed.EventName, async (e: EmailConfirmed) => {
      events.push(e)
      return { ack: true, payload: "test" }
    })
    await rabbitServiceBus.start([createEventBuilderFor("_", EmailConfirmed)], opts.rabbitOptions.tmpQueue)
    const event = EmailConfirmed.create({ userId: randomUUID(), email: "a@a.it" })

    await rabbitServiceBus.emit(event)

    await eventually(() => expect(events).lengthOf(1))
    const info = (await rabbit.getInfo()) as RabbitGetInfo
    const queueInfo = getQueueInfoOf(info, EmailConfirmed.EventName)
    expect(queueInfo.messageCount).eql(0)
  })

  it("when handler return nack then nack message and DONT reenqueue it", async () => {
    const events: EmailConfirmed[] = []
    rabbitServiceBus.register(EmailConfirmed.EventName, async (e: EmailConfirmed) => {
      events.push(e)
      return { ack: false, payload: "test" }
    })
    await rabbitServiceBus.start([createEventBuilderFor("_", EmailConfirmed)], opts.rabbitOptions.tmpQueue)
    const event = EmailConfirmed.create({ userId: randomUUID(), email: "a@a.it" })

    await rabbitServiceBus.emit(event)

    await eventually(async () => {
      const info = (await rabbit.getInfo()) as RabbitGetInfo
      const queueInfo = getQueueInfoOf(info, EmailConfirmed.EventName)
      expect(queueInfo.messageCount).eql(0)
    })
    expect(events).lengthOf(1)
    // TODO verify it's present in DLQ
  })

  it("when handler raise exception then nack and reenqueue message first time", async () => {
    const events: EmailConfirmed[] = []
    rabbitServiceBus.register(EmailConfirmed.EventName, async (e: EmailConfirmed) => {
      events.push(e)
      throw new Error("Error !!!")
    })
    await rabbitServiceBus.start([createEventBuilderFor("_", EmailConfirmed)], opts.rabbitOptions.tmpQueue)
    const event = EmailConfirmed.create({ userId: randomUUID(), email: "a@a.it" })

    await rabbitServiceBus.emit(event)

    await eventually(async () => {
      const info = (await rabbit.getInfo()) as RabbitGetInfo
      const queueInfo = getQueueInfoOf(info, EmailConfirmed.EventName)
      expect(queueInfo.messageCount).eql(0)
    })
    expect(events).lengthOf(2)
  })

  it("raise exception if handler is already registered", () => {
    rabbitServiceBus.register(UserCreated.EventName, () => Promise.resolve({ ack: true, payload: "" }))
    expect(() => {
      rabbitServiceBus.register(UserCreated.EventName, () => Promise.resolve({ ack: true, payload: "" }))
    }).throws(`${UserCreated.EventName} is already registered!`)
  })

  it("create queue when start serviceBus", async () => {
    rabbitServiceBus.register(UserCreated.EventName, () => Promise.resolve({ ack: true, payload: "" }))

    await rabbitServiceBus.start([createEventBuilderFor("_", UserCreated)], opts.rabbitOptions.tmpQueue)

    const info = (await rabbit.getInfo()) as RabbitGetInfo
    const queueInfo = getQueueInfoOf(info, UserCreated.EventName)
    expect(queueInfo.queue).eql(`ms_temp_${UserCreated.EventName}_tmp`)
  })

  it("raise exception if we don't have enough handlers for builders", async () => {
    rabbitServiceBus.register(UserCreated.EventName, () => Promise.resolve({ ack: true, payload: "" }))

    await expectThrowsAsync(
      () =>
        rabbitServiceBus.start(
          [createEventBuilderFor("_", UserCreated), createEventBuilderFor("_", EmailConfirmed)],
          opts.rabbitOptions.tmpQueue
        ),
      Error
    )
  })
})

// describe("Rabbit", () => {
//   const opts = getTestOptions()
//   const logger = configureLogger(opts.logger)
//   const rabbit = new Rabbit(opts.rabbitOptions.uri, "temp", 50, logger)
//   it("ack")
//   it("nack")
// })

function getQueueInfoOf(info: RabbitGetInfo, eventName: string) {
  const queueInfo = info.queues.find((q) => q.queue.includes(eventName))
  if (!queueInfo) throw new AssertionError(`Unable to find ${eventName} in ${inspect(info)}`)
  return queueInfo
}
