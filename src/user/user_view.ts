import { Db } from "../infra/db"
import sql from "sql-template-tag"

export interface UserItem {
  id: string
  email: string
  dateOfBirth: Date | null
  confirmedAt: Date | null
  firstName: string
  lastName: string
  version: number
}

export class UserView {
  constructor(private db: Db) {}
  findAll(): Promise<UserItem[]> {
    return this.db
      .query<SqlSchema.users>(sql`select * from users order by id`)
      .then((rows) => rows.map((r) => toUserItem(r)))
  }
}

function toUserItem(r: SqlSchema.users): UserItem {
  return {
    id: r.id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    dateOfBirth: r.date_of_birth,
    confirmedAt: r.confirmed_at,
    version: r.version,
  }
}
