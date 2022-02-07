import request from "supertest"
import { getTestApp, getTestOptions } from "../support/test_app"
import { createUser } from "../support/fake_data"
import { configureLogger, connectToDb } from "../../src/app"
import { Db } from "../../src/infra/db"
import { UserRepository } from "../../src/user/user_repository"
import { FakeEventBus } from "../support/fake_event_bus"
import { EventId } from "../../src/infra/ids"
import { DomainTrace } from "../../src/infra/domain_trace"
import { expect } from "chai"
import { TestConsumer } from "../support/test_consumer"
import { range } from "lodash"
import { Application } from "express"
import { User } from "../../src/user/user"
import sql from "sql-template-tag"
import { validateUsersPayloadBodySchema } from "../../src/controllers/users"

describe("GET /users", async () => {
  const users = range(1).map((_) => createUser())
  const opts = getTestOptions()
  const logger = configureLogger(opts.logger)
  const fakeEventBus = new FakeEventBus()
  const domainTrace = DomainTrace.create(EventId.new())
  const testConsumer = new TestConsumer(opts.rabbitOptions.uri, logger)
  let db: Db
  let repository: UserRepository
  let app: Application

  before(async () => {
    app = await getTestApp()
    const res = await connectToDb(opts.dbOptions, logger)
    db = res.db
  })

  beforeEach(async () => {
    await db.query(sql`TRUNCATE users CASCADE`)
    repository = new UserRepository(db, fakeEventBus)
    await Promise.all(users.map((user) => repository.save(user, domainTrace, logger)))
  })
  beforeEach(() => testConsumer.start())

  afterEach(() => testConsumer.disconnect())

  it("list all users", async () => {
    const res = await request(app).get("/api/users").expect(200)

    expect(validateUsersPayloadBodySchema(res.body)).true
    expect(res.body.data).eql(
      users.sort((a, b) => a.id.toValue().localeCompare(b.id.toValue())).map((u) => toUserItem(u))
    )
  })
})

function toUserItem(u: User) {
  return {
    id: u.id.toValue(),
    email: u.data.email,
    firstName: u.data.firstName,
    lastName: u.data.lastName,
    dateOfBirth: u.data.dateOfBirth?.toISOString() || null,
    confirmedAt: u.data.confirmedAt?.toISOString() || null,
    version: u.version + 1,
  }
}
