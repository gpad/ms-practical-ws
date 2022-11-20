import sql, { join } from "sql-template-tag"
import { differenceBy, intersectionBy, isEmpty } from "lodash"
import { Rabbit, RabbitMessage } from "./rabbit"
import { Db, Queryable } from "./db"
import { Logger } from "winston"
import { inspect } from "util"
import { AggregateVersion, DomainEvent } from "./aggregate"
import { DomainTrace } from "./domain_trace"
import { EventBus } from "./event_bus"

export async function startOutboxPatternMonitor(rabbit: Rabbit, db: Db, logger: Logger) {
  const warning = await getEventsToPublish(db)
  scheduleCheck(warning, rabbit, db, logger)
}

export async function saveEvents(
  tr: Queryable,
  events: DomainEvent[],
  aggregateVersion: number,
  trace: DomainTrace
): Promise<DomainEvent[]> {
  const enrichedEvents = events.map((e, i) => e.enrich({ trace, version: new AggregateVersion(aggregateVersion, i) }))
  const queries = enrichedEvents.map(
    (e) => sql`INSERT into aggregate_events 
  (
    id, 
    aggregate_id,
    event_name,
    aggregate_version,
    aggregate_version_index,
    causation_id,
    correlation_id,
    public,
    published,
    payload
  )
  VALUES
  (
    ${e.id.toValue()},
    ${e.aggregateId.toValue()},
    ${e.eventName},
    ${e.aggregateVersion.version},
    ${e.aggregateVersion.index},
    ${e.domainTrace.causationId.toValue()},
    ${e.domainTrace.correlationId.toValue()},
    ${e.public},
    false,
    ${e.toPayload() as {}}
  )`
  )
  await Promise.all(queries.map((q) => tr.query(q)))
  return enrichedEvents
}

export async function emitAllEvents(events: DomainEvent[], db: Db, eventBus: EventBus, logger: Logger): Promise<void> {
  if (isEmpty(events)) return
  const ids = events.map((e) => e.id.toValue())
  try {
    await db.transaction(async (tr) => {
      const xyz = await tr.query<SqlSchema.aggregate_events>(
        sql`select * from aggregate_events where id IN (${join(ids)}) FOR UPDATE`
      )
      await eventBus.emits(filterAlreadyPublished(events, xyz))
      await tr.query(sql`update aggregate_events set published = true where id IN (${join(ids)})`)
    })
  } catch (error) {
    logger.error(`Unable to emit events: ${inspect(events, { depth: 10 })}`)
  }
}

function scheduleCheck(warning: SqlSchema.aggregate_events[], rabbit: Rabbit, db: Db, logger: Logger) {
  setTimeout(async () => {
    const current = await getEventsToPublish(db)
    const toPublish = intersectionBy(warning, current, (e) => e.id)
    try {
      await publishEventsFromDB(toPublish, rabbit, db, logger)
      const nextWarning = differenceBy(current, warning, (e) => e.id)
      scheduleCheck(nextWarning, rabbit, db, logger)
    } catch (error) {
      logger.error(`Unable to publish events error: ${inspect(error)}`)
      const nextWarning = await getEventsToPublish(db)
      scheduleCheck(nextWarning, rabbit, db, logger)
    }
  }, 500)
}

function getEventsToPublish(db: Db) {
  return db.query<SqlSchema.aggregate_events>(sql`select * from aggregate_events where not published and public`)
}

async function publishEventsFromDB(candidates: SqlSchema.aggregate_events[], rabbit: Rabbit, db: Db, logger: Logger) {
  if (isEmpty(candidates)) return
  const candidatesIds = candidates.map((e) => e.id)
  logger.info(`Try to publish this events ${candidatesIds}`)
  try {
    await db.transaction(async (tr) => {
      const events = await tr.query<SqlSchema.aggregate_events>(
        sql`select * from aggregate_events where id IN (${join(candidatesIds)}) AND NOT published AND public FOR UPDATE`
      )
      if (isEmpty(events)) {
        logger.info("No real events to publish!")
        return
      }
      logger.info(`Publishing events ${inspect(events, { depth: 10 })}`)
      await rabbit.publishAll(events.map(toMessageFromDb))
      await tr.query(sql`update aggregate_events set published = true where id IN (${join(events.map((e) => e.id))})`)
      logger.info(`Publishing events ${events.map((e) => e.id)} completed!!!`)
    })
  } catch (error) {
    logger.error(`Unable to emit events: ${inspect(candidates, { depth: 10 })}`)
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

function filterAlreadyPublished(events: DomainEvent[], xyz: SqlSchema.aggregate_events[]): DomainEvent[] {
  return events.filter((e) => {
    const db = xyz.find((x) => x.id === e.id.toValue())
    return db && !db.published
  })
}
