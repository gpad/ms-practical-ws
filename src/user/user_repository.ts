import { EventBus } from "../infra/event_bus"
import { DomainTrace } from "../infra/domain_trace"
import { User, UserId } from "./user"
import sql, { RawValue } from "sql-template-tag"
import { Db } from "../infra/db"
import { Logger } from "winston"
import { inspect } from "util"
import { ConcurrencyError } from "../infra/local_command_bus"
import { emitAllEvents, saveEvents } from "../infra/outbox_pattern"

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
          , ${user.data.dateOfBirth as RawValue}
          , ${user.data.confirmedAt as RawValue}
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
    logger.info(`User ${user.id} saved! - ${inspect(trace)} elapsed: ${Date.now() - startAt}`)

    logger.info(`Emitting all events ${inspect(enrichedEvents)} from successful write to database`)
    await emitAllEvents(enrichedEvents, this.db, this.eventBus, logger)
    logger.info(`All events for ${user.id} successfully emitted! - ${inspect(trace)} elapsed: ${Date.now() - startAt}`)
  }
}
