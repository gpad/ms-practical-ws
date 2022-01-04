import { ClientBase, Pool } from "pg"
import { Sql } from "sql-template-tag"

// export type Asdf = {
//   query<T>(q: Sql): Promise<T[]>
// }

class Queryable {
  constructor(private readonly client: ClientBase) {}

  async query<T>(q: Sql): Promise<T[]> {
    const res = await this.client.query<T>(q)
    return res.rows
  }
}

export class Db {
  constructor(readonly pool: Pool) {}

  async query<T>(q: Sql): Promise<T[]> {
    const res = await this.pool.query<T>(q)
    return res.rows
  }
  async transaction(f: (tr: Queryable) => Promise<void>) {
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      await f(new Queryable(client))
      await client.query("COMMIT")
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }
}
