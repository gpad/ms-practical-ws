import { Request, Response } from "express"
import { Db } from "../infra/db"
import { Rabbit } from "../infra/rabbit"
import sql from "sql-template-tag"

export const createHealthz = function (db: Db, rabbit: Rabbit) {
  return async (_req: Request, res: Response, next: (e?: Error) => void): Promise<void> => {
    try {
      const stats = await getPgStats(db)
      const info = await rabbit.getInfo()
      res.status(200).json({ status: "ok", db: stats, rabbit: info })
    } catch (e) {
      next(e as Error)
    }
  }
}

async function getPgStats(db: Db) {
  const maxConnections = await db.query(sql`SELECT * FROM pg_settings WHERE name = 'max_connections'`)
  const pgStatActivity = await db.query(sql`SELECT * FROM pg_stat_activity where datname = current_database()`)
  const pgStatDatabase = await db.query(sql`SELECT * FROM pg_stat_database where datname = current_database()`)
  const [{ sum: pgActiveConnections }] = await db.query<{ sum: number }>(
    sql`SELECT sum(numbackends) FROM pg_stat_database`
  )
  const pgConnectionsStatus = await db.query(sql`
  select
    max_conn,
    used,
    res_for_super,
    (max_conn-used - res_for_super) as res_for_normal
  from
    (select count(*) used from pg_stat_activity) t1,
    (select setting::int res_for_super from pg_settings where name=$$superuser_reserved_connections$$) t2,
    (select setting:: int max_conn from pg_settings where name = $$max_connections$$) t3
  `)
  return {
    maxConnections,
    pgStatActivity,
    pgStatDatabase,
    pgConnectionsStatus,
    pgActiveConnections,
  }
}
