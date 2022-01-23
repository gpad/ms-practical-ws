import sql, { join } from "sql-template-tag"
import { intersectionBy, isEmpty } from "lodash"
import { Rabbit, RabbitMessage } from "./rabbit"
import { Db } from "./db"
import { Logger } from "winston"
import { inspect } from "util"

async function verifyEvents(
  before: SqlSchema.aggregate_events[],
  rabbit: Rabbit,
  db: Db,
  logger: Logger
): Promise<State> {
  const now = await db.query<SqlSchema.aggregate_events>(sql`select * from aggregate_events where not published`)
  logger.info(`Found these events not yet published ${inspect(now)} - before: ${inspect(before)}`)
  const toPublish = getNotYetPublished(before, now)
  await publishEventsFromDB(toPublish, rabbit, db, logger)
  return createState(now)
}

const createState = (events: SqlSchema.aggregate_events[]): State => {
  return (rabbit: Rabbit, db: Db, logger: Logger) => {
    return verifyEvents(events, rabbit, db, logger)
  }
}

async function findPossibleEvents(_rabbit: Rabbit, db: Db): Promise<State> {
  const ret = await db.query<SqlSchema.aggregate_events>(sql`select * from aggregate_events where not published`)
  return createState(ret)
}

type State = (rabbit: Rabbit, db: Db, logger: Logger) => Promise<State>

export function startOutboxPatternMonitor(rabbit: Rabbit, db: Db, logger: Logger) {
  logger.info("Start startOutboxPatternMonitor")
  let execute: State = findPossibleEvents
  setInterval(async () => {
    logger.info("Monitoring outbox pattern")
    const next = await execute(rabbit, db, logger)
    execute = next
  }, 5000)
}
function getNotYetPublished(before: SqlSchema.aggregate_events[], now: SqlSchema.aggregate_events[]) {
  return intersectionBy(before, now, (e) => e.id)
}

async function publishEventsFromDB(toPublish: SqlSchema.aggregate_events[], rabbit: Rabbit, db: Db, logger: Logger) {
  if (isEmpty(toPublish)) return
  logger.info(`Try to publish this events ${inspect(toPublish, { depth: 10 })}`)
  const ids = toPublish.map((e) => e.id)
  try {
    await db.transaction(async (tr) => {
      const xyz = await tr.query<SqlSchema.aggregate_events>(
        sql`select * from aggregate_events where id IN (${join(ids)}) FOR UPDATE`
      )
      const events = filterAlreadyPublished(toPublish, xyz)
      logger.info(`Publishing events ${inspect(events, { depth: 10 })}`)
      await rabbit.publishAll(events.map(toMessageFromDb))
      await tr.query(sql`update aggregate_events set published = true where id IN (${join(ids)})`)
      logger.info(`Publishing events ${inspect(events, { depth: 10 })} completed!!!`)
    })
  } catch (error) {
    logger.error(`Unable to emit events: ${inspect(toPublish, { depth: 10 })}`)
  }
}

function toMessageFromDb(message: SqlSchema.aggregate_events): RabbitMessage {
  return {
    aggregateVersion: message.aggregate_version,
    aggregateVersionIndex: message.aggregate_version_index,
    causationId: message.causation_id,
    correlationId: message.correlation_id,
    eventName: message.event_name,
    messageId: message.id,
    payload: message.payload,
  }
}

function filterAlreadyPublished(
  events: SqlSchema.aggregate_events[],
  xyz: SqlSchema.aggregate_events[]
): SqlSchema.aggregate_events[] {
  return events.filter((e) => {
    const db = xyz.find((x) => x.id === e.id)
    return db && !db.published
  })
}
