import { Db } from "../../src/infra/db"
import { startOutboxPatternMonitor } from "../../src/infra/outbox_pattern"
import { TestConsumer } from "../support/test_consumer"
import sql from "sql-template-tag"
import { randomUUID } from "crypto"
import { configureLogger, connectToDb } from "../../src/app"
import { getTestOptions } from "../support/test_app"
import { Rabbit } from "../../src/infra/rabbit"

describe("outbox patter", () => {
  let db: Db
  const opts = getTestOptions()
  const logger = configureLogger(opts.logger)
  const rabbit = new Rabbit(opts.rabbitOptions.uri, "ms_temp", 50, logger)
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

  it("publish event when rabbit comes back", async () => {
    const notPublicEvent1 = await addUnpublishedEvent(db, { public: false })
    const notPublicEvent2 = await addUnpublishedEvent(db, { public: false })
    const event = await addUnpublishedEvent(db)
    await startOutboxPatternMonitor(rabbit, db, logger)
    await testConsumer.assertReceive((msg) => msg.messageId === event.id)
    testConsumer.assertNotReceived((msg) => msg.messageId === notPublicEvent1.id)
    testConsumer.assertNotReceived((msg) => msg.messageId === notPublicEvent2.id)
  })
})

function addUnpublishedEvent(db: Db, opts: Partial<SqlSchema.aggregate_events> = {}) {
  const event: SqlSchema.aggregate_events = {
    id: randomUUID(),
    aggregate_id: randomUUID(),
    aggregate_version: 0,
    aggregate_version_index: 1,
    causation_id: randomUUID(),
    correlation_id: randomUUID(),
    event_name: "test_name",
    payload: { value: randomUUID() },
    public: true,
    published: false,
    ...opts,
  }
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
    ${event.payload},
    ${event.public},
    ${event.published}
  )`

  return db.query(query).then(() => event)
}
