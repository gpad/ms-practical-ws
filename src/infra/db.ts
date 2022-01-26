import { ClientBase, Pool } from "pg"
import { Sql } from "sql-template-tag"

export class Queryable {
  constructor(private readonly client: ClientBase) {}

  async query<T>(q: Sql): Promise<T[]> {
    const res = await this.client.query<T>(q)
    return res.rows
  }
}

export class Db {
  constructor(private readonly pool: Pool) {}

  async query<T>(q: Sql): Promise<T[]> {
    const res = await this.pool.query<T>(q)
    return res.rows
  }
  async transaction<T>(f: (tr: Queryable) => Promise<T>) {
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      const ret = await f(new Queryable(client))
      await client.query("COMMIT")
      return ret
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }
}
