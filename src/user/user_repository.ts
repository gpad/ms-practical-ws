import { EventBus } from "../infra/event_bus"
import { DomainTrace } from "../infra/domain_trace"
import { User, UserId } from "./user"
import sql, { join } from "sql-template-tag"
import { Db, Queryable } from "../infra/db"
import { Logger } from "winston"
import { inspect } from "util"
import { AggregateVersion, DomainEvent } from "../infra/aggregate"
import { isEmpty } from "lodash"

export class UserRepository {
  constructor(private db: Db, private eventBus: EventBus) {}

  async findById(id: UserId): Promise<User | null> {
    const [row] = await this.db.query<SqlSchema.users>(sql`select * from users where id = ${id.toValue()}`)
    if (!row?.id) return null
    return new User(
      UserId.from(row.id),
      {
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        dateOfBirth: row.date_of_birth,
        confirmedAt: row.confirmed_at,
      },
      row.version,
      []
    )
  }

  async getById(id: UserId): Promise<User> {
    const user = await this.findById(id)
    if (!user) throw Error(`Cannot find entry for user ${id}`)
    return user
  }

  async save(user: User, trace: DomainTrace, logger: Logger) {
    logger.info(`Saving user: ${inspect(user)} to database`)
    const startAt = Date.now()

    const enrichedEvents = await this.db.transaction(async (tr) => {
      const [row] = await tr.query(sql`
          insert into users (id, version, email, first_name, last_name, date_of_birth, confirmed_at)
          values
          (
            ${user.id.toValue()}
          , ${user.version + 1}
          , ${user.data.email}
          , ${user.data.firstName}
          , ${user.data.lastName}
          , ${user.data.dateOfBirth}
          , ${user.data.confirmedAt}
          )
          ON CONFLICT (id) DO UPDATE
          SET
            version = EXCLUDED.version
            , email = EXCLUDED.email
            , first_name = EXCLUDED.first_name
            , last_name = EXCLUDED.last_name
            , date_of_birth = EXCLUDED.date_of_birth
            , confirmed_at = EXCLUDED.confirmed_at
          WHERE users.version = ${user.version}
          RETURNING *
        `)

      if (!row) {
        throw new ConcurrencyError(`Saving ${user.id} - ${user.version} got concurrency error`)
      }
      return saveEvents(tr, user.commitEvents(), user.version, trace)
    })
    logger.info(`User ${user.id} saved! - ${trace} elapsed: ${Date.now() - startAt}`)

    logger.info(`Emitting all events ${inspect(enrichedEvents)} from successful write to database`)
    await this.emitAllEvents(enrichedEvents)
    logger.info(`All events for ${user.id} successfully emitted! - ${trace} elapsed: ${Date.now() - startAt}`)
  }

  private async emitAllEvents(events: DomainEvent[]) {
    if (isEmpty(events)) return
    const ids = events.map((e) => e.id.toValue())
    await this.db.transaction(async (tr) => {
      const xyz = await tr.query<SqlSchema.aggregate_events>(
        sql`select * from aggregate_events where id IN (${join(ids)}) FOR UPDATE`
      )
      await this.eventBus.emits(filterAlreadyPublished(events, xyz))
      await tr.query(sql`update aggregate_events set published = true where id IN (${join(ids)})`)
    })
  }
}

export class ConcurrencyError extends Error {
  constructor(message: string) {
    super(`ConcurrencyError in ${message}`)
  }
}
async function saveEvents(
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

function filterAlreadyPublished(events: DomainEvent[], xyz: SqlSchema.aggregate_events[]): DomainEvent[] {
  return events.filter((e) => {
    const db = xyz.find((x) => x.id === e.id.toValue())
    return db && !db.published
  })
}
