import { Db } from "../../src/infra/db"
import {
  FromDbDomainEvent,
  FromDbPublicDomainEvent,
  emitAllEvents,
  saveEvents,
  startOutboxPatternMonitor,
} from "../../src/infra/outbox_pattern"
import { TestConsumer } from "../support/test_consumer"
import sql, { join, RawValue } from "sql-template-tag"
import { configureLogger, connectToDb } from "../../src/app"
import { getTestOptions } from "../support/test_app"
import { Rabbit } from "../../src/infra/rabbit"
import {
  createFakePublicAggregateEvent,
  TestDomainEvent,
  TestPublicDomainEvent,
  validateTestPublicDomainEventPayload,
} from "../support/fake_data"
import { DomainTrace } from "../../src/infra/domain_trace"
import { EventId } from "../../src/infra/ids"
import { expect } from "chai"
import { AggregateVersion, DomainEvent, PublicDomainEvent } from "../../src/infra/aggregate"
import { FakeEventBus } from "../support/fake_event_bus"
import { RabbitServiceBus, createEventBuilderFor } from "../../src/infra/rabbit_service_bus"
import { eventually } from "../support/expect_util"
import { EventResult } from "../../src/infra/event_bus"
import { randomUUID } from "node:crypto"

describe("outbox patter", () => {
  let db: Db
  const opts = getTestOptions()
  const logger = configureLogger(opts.logger)
  const rabbit = new Rabbit(opts.rabbitOptions.uri, "ms_temp", "test", 50, logger)
  const serviceBus = new RabbitServiceBus(rabbit, "ms_temp", logger)
  const testConsumer = new TestConsumer(opts.rabbitOptions.uri, logger)

  beforeEach(async () => {
    const res = await connectToDb(opts.dbOptions, logger)
    db = res.db
    await rabbit.connect({ temporary: true })
    await testConsumer.start()
  })

  afterEach(() => db.query(sql`TRUNCATE aggregate_events CASCADE`))
  afterEach(() => testConsumer.disconnect())
  afterEach(() => rabbit.disconnect())
  afterEach(() => serviceBus.stop())

  it("publish public event when rabbit comes back", async () => {
    const notPublicEvent1 = await addUnpublishedEvent(db, { public: false })
    const notPublicEvent2 = await addUnpublishedEvent(db, { public: false })
    const event = await addUnpublishedEvent(db)
    await serviceBus.start([], true)

    await startOutboxPatternMonitor(serviceBus, db, logger)

    await testConsumer.assertReceive((msg) => msg.messageId === event.id)
    testConsumer.assertNotReceived((msg) => msg.messageId === notPublicEvent1.id)
    testConsumer.assertNotReceived((msg) => msg.messageId === notPublicEvent2.id)
  })

  it("execute also local event when rabbit comes back", async () => {
    const notPublicEvent1 = await addUnpublishedEvent(db, { public: false })
    const notPublicEvent2 = await addUnpublishedEvent(db, { public: false })
    const event = await addUnpublishedEvent(db)
    const events: DomainEvent[] = []
    serviceBus.register(notPublicEvent1.event_name, (e) => {
      events.push(e)
      return Promise.resolve({ ack: true })
    })
    await serviceBus.start([], true)

    await startOutboxPatternMonitor(serviceBus, db, logger)

    await testConsumer.assertReceive((msg) => msg.messageId === event.id)
    testConsumer.assertNotReceived((msg) => msg.messageId === notPublicEvent1.id)
    testConsumer.assertNotReceived((msg) => msg.messageId === notPublicEvent2.id)
    await eventually(() => expect(events.map((e) => e.id.toValue())).members([notPublicEvent1.id, notPublicEvent2.id]))
    const res = await db.query<Pick<SqlSchema.aggregate_events, "published">>(
      sql`select published from aggregate_events where id IN (${join([notPublicEvent1.id, notPublicEvent2.id])})`
    )
    expect(res).eql([{ published: true }, { published: true }])
  }).timeout(5000)

  it("mark as published after all the attempts", async () => {
    const notPublicEvent1 = await addUnpublishedEvent(db, { public: false })
    const event = await addUnpublishedEvent(db)
    const events: DomainEvent[] = []
    serviceBus.register(notPublicEvent1.event_name, (e) => {
      events.push(e)
      return Promise.resolve({ ack: false })
    })
    await serviceBus.start([], true)

    await startOutboxPatternMonitor(serviceBus, db, logger)

    await testConsumer.assertReceive((msg) => msg.messageId === event.id)
    testConsumer.assertNotReceived((msg) => msg.messageId === notPublicEvent1.id)
    await eventually(() => expect(events.map((e) => e.id.toValue())).members(Array(3).fill(notPublicEvent1.id)))
    const res = await db.query<Pick<SqlSchema.aggregate_events, "published">>(
      sql`select published from aggregate_events where id IN (${join([notPublicEvent1.id])})`
    )
    expect(res).eql([{ published: true }])
  }).timeout(5000)

  it("emitAllEvents emits public and local events", async () => {
    const fakeEventBus = new FakeEventBus()
    const events = [TestPublicDomainEvent.create(), TestDomainEvent.create()]
    const trace = DomainTrace.create(EventId.new())
    const enrichedEvents = await db.transaction((tr) => saveEvents(tr, events, 42, trace))

    await emitAllEvents(enrichedEvents, db, fakeEventBus, logger)

    expect(fakeEventBus.events).eql(enrichedEvents)
  })

  it("emitAllEvents emits only not already published events", async () => {
    const fakeEventBus = new FakeEventBus()
    const events = [TestPublicDomainEvent.create(), TestPublicDomainEvent.create()]
    const trace = DomainTrace.create(EventId.new())
    const enrichedEvents = await db.transaction((tr) => saveEvents(tr, events, 42, trace))
    await markAsPublished(db, events[0])

    await emitAllEvents(enrichedEvents, db, fakeEventBus, logger)

    expect(fakeEventBus.events).eql([enrichedEvents[1]])
  })

  it("saveEvents save and return public and local events", async () => {
    const events = [TestPublicDomainEvent.create(), TestDomainEvent.create()]
    const trace = DomainTrace.create(EventId.new())
    const version = 42

    const ret = await db.transaction((tr) => saveEvents(tr, events, version, trace))

    const enrichedEvents = events.map((e, i) => e.enrich({ version: new AggregateVersion(version, i), trace }))
    expect(ret).eql(enrichedEvents)
    const sqlEvent = await db.query<SqlSchema.aggregate_events>(
      sql`select * from aggregate_events order by public DESC`
    )
    expect(sqlEvent).eql(toSql(enrichedEvents))
  })

  it("FromDB events can impersonate other events", async () => {
    const events: DomainEvent[] = []
    serviceBus.register(TestDomainEvent.EventName, (e) => ack(events.push(e)))
    serviceBus.register(TestPublicDomainEvent.EventName, (e) => ack(events.push(e)))
    await serviceBus.start([createEventBuilderFor(validateTestPublicDomainEventPayload, TestPublicDomainEvent)], true)

    await serviceBus.emit(
      FromDbDomainEvent.createFrom(
        createFakePublicAggregateEvent({ public: false, event_name: TestDomainEvent.EventName })
      )
    )
    await serviceBus.emit(
      FromDbPublicDomainEvent.createFrom(
        createFakePublicAggregateEvent({
          public: true,
          event_name: TestPublicDomainEvent.EventName,
          payload: { id: randomUUID() },
        })
      )
    )

    await eventually(() =>
      expect(events.map((e) => e.eventName)).members([TestDomainEvent.EventName, TestPublicDomainEvent.EventName])
    )
  })
})

function addUnpublishedEvent(db: Db, opts: Partial<SqlSchema.aggregate_events> = {}) {
  const event: SqlSchema.aggregate_events = createFakePublicAggregateEvent(opts)
  const query = sql`INSERT into aggregate_events (
    id,
    aggregate_id,
    aggregate_version,
    aggregate_version_index,
    causation_id,
    correlation_id,
    event_name,
    payload,
    public,
    published
  ) VALUES (
    ${event.id},
    ${event.aggregate_id},
    ${event.aggregate_version},
    ${event.aggregate_version_index},
    ${event.causation_id},
    ${event.correlation_id},
    ${event.event_name},
    ${event.payload as RawValue},
    ${event.public},
    ${event.published}
  )`

  return db.query(query).then(() => event)
}

function toSql(list: Array<DomainEvent | PublicDomainEvent>): SqlSchema.aggregate_events[] {
  return list.map((e) => ({
    aggregate_id: e.aggregateId.toValue(),
    aggregate_version: e.aggregateVersion.version,
    aggregate_version_index: e.aggregateVersion.index,
    causation_id: e.domainTrace.causationId.toValue(),
    correlation_id: e.domainTrace.correlationId.toValue(),
    event_name: e.eventName,
    id: e.id.toValue(),
    payload: e.toPayload() as SqlSchema.JSONObject,
    public: e.public,
    published: false,
  }))
}

function markAsPublished(db: Db, event: PublicDomainEvent) {
  const query = sql`UPDATE aggregate_events  SET published = TRUE where id = ${event.id.toValue()}`
  return db.query(query)
}

function ack(_: unknown): Promise<EventResult> {
  return Promise.resolve({ ack: true })
}
