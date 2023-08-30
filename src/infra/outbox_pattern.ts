import sql, { join } from "sql-template-tag"
import { differenceBy, intersectionBy, isEmpty } from "lodash"
import { Db, Queryable } from "./db"
import { Logger } from "winston"
import { inspect } from "util"
import { AggregateVersion, DomainEvent, EnrichOptions, PublicDomainEvent } from "./aggregate"
import { DomainTrace } from "./domain_trace"
import { EventBus } from "./event_bus"
import { AggregateId, CausationId, CorrelationId, EventId } from "./ids"

export async function startOutboxPatternMonitor(rabbit: EventBus, db: Db, logger: Logger) {
  const warning = await getEventsToPublish(db)
  scheduleCheck(warning, rabbit, db, logger)
}

function scheduleCheck(warning: SqlSchema.aggregate_events[], rabbit: EventBus, db: Db, logger: Logger) {
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
  return db.query<SqlSchema.aggregate_events>(sql`select * from aggregate_events where not published`)
}

async function publishEventsFromDB(candidates: SqlSchema.aggregate_events[], rabbit: EventBus, db: Db, logger: Logger) {
  if (isEmpty(candidates)) {
    logger.debug("Nothing to publish")
    return
  }
  const candidatesIds = candidates.map((e) => e.id)
  logger.info(`Try to publish this events ${candidatesIds}`)
  try {
    await db.transaction(async (tr) => {
      const events = await tr.query<SqlSchema.aggregate_events>(
        sql`select * from aggregate_events where id IN (${join(candidatesIds)}) AND NOT published FOR UPDATE`
      )
      if (isEmpty(events)) {
        logger.info("No real events to publish!")
        return
      }
      logger.info(`Publishing events ${inspect(events, { depth: 10 })}`)
      await rabbit.emits(events.map(toDomainEventFrom))
      await tr.query(sql`update aggregate_events set published = true where id IN (${join(events.map((e) => e.id))})`)
      logger.info(`Publishing events ${events.map((e) => e.id)} completed!!!`)
    })
  } catch (error) {
    logger.error(`Unable to emit events: ${inspect(candidates, { depth: 10 })}`)
  }
}

export class FromDbId extends AggregateId<"from_db_id"> {
  readonly type = "from_db_id"
}

export class FromDbDomainEvent extends DomainEvent {
  static createFrom(message: SqlSchema.aggregate_events): FromDbDomainEvent {
    return new FromDbDomainEvent(
      EventId.from(message.id),
      FromDbId.from(message.aggregate_id),
      message.event_name,
      message.payload,
      new AggregateVersion(message.aggregate_version, message.aggregate_version_index),
      new DomainTrace(CorrelationId.from(message.correlation_id), CausationId.from(message.causation_id))
    )
  }

  constructor(
    id: EventId,
    aggregateId: FromDbId,
    eventName: string,
    private readonly payload: unknown,
    aggregateVersion: AggregateVersion,
    domainTrace: DomainTrace
  ) {
    super(id, aggregateId, eventName, aggregateVersion, domainTrace)
  }

  enrich(opts: EnrichOptions): FromDbDomainEvent {
    throw new Error(`Enrich with ${opts} not implemented for FromDbDomainEvent`)
  }

  toPayload() {
    return this.payload
  }
}

export class FromDbPublicDomainEvent extends PublicDomainEvent {
  static createFrom(message: SqlSchema.aggregate_events): FromDbPublicDomainEvent {
    return new FromDbPublicDomainEvent(
      EventId.from(message.id),
      FromDbId.from(message.aggregate_id),
      message.event_name,
      message.payload,
      new AggregateVersion(message.aggregate_version, message.aggregate_version_index),
      new DomainTrace(CorrelationId.from(message.correlation_id), CausationId.from(message.causation_id))
    )
  }

  constructor(
    id: EventId,
    aggregateId: FromDbId,
    eventName: string,
    private readonly payload: unknown,
    aggregateVersion: AggregateVersion,
    domainTrace: DomainTrace
  ) {
    super(id, aggregateId, eventName, aggregateVersion, domainTrace)
  }

  enrich(opts: EnrichOptions): FromDbDomainEvent {
    throw new Error(`Enrich with ${opts} not implemented for FromDbDomainEvent`)
  }

  toPayload() {
    return this.payload
  }
}

function toDomainEventFrom(message: SqlSchema.aggregate_events): DomainEvent {
  return message.public ? FromDbPublicDomainEvent.createFrom(message) : FromDbDomainEvent.createFrom(message)
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
    ${e.toPayload() as SqlSchema.JSONObject}
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
      const dbEvents = await tr.query<SqlSchema.aggregate_events>(
        sql`select * from aggregate_events where id IN (${join(ids)}) AND not published FOR UPDATE`
      )
      await eventBus.emits(filterEvents(events, dbEvents))
      await tr.query(sql`update aggregate_events set published = true where id IN (${join(dbEvents.map((e) => e.id))})`)
    })
  } catch (error) {
    logger.error(`Unable to emit events: ${inspect(events, { depth: 10 })}`)
  }
}

function filterEvents(events: DomainEvent[], dbEvents: SqlSchema.aggregate_events[]): DomainEvent[] {
  return events.filter((e) => dbEvents.find((x) => x.id === e.id.toValue()))
}
