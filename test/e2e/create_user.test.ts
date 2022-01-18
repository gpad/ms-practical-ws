import request from "supertest"
import { Application } from "express"
import { getTestApp, getTestOptions } from "../support/test_app"
import { expect } from "chai"
import { internet, name } from "faker"
import { UserCreated, UserData } from "../../src/user/user"
import { configureLogger, connectToDb } from "../../src/app"
import { TestConsumer } from "../support/test_consumer"
import { validate } from "uuid"
import { CreateUserPayload } from "../../src/controllers/users"
import { Db } from "../../src/infra/db"
import sql from "sql-template-tag"

describe("create user via API", async () => {
  let app: Application
  let db: Db

  const opts = getTestOptions()
  const logger = configureLogger(opts.logger)
  const testConsumer = new TestConsumer(opts.rabbitOptions.uri, logger)

  before(async () => {
    app = await getTestApp()
  })

  beforeEach(async () => {
    const res = await connectToDb(opts.dbOptions, logger)
    db = res.db
  })

  beforeEach(() => testConsumer.start())
  afterEach(() => testConsumer.disconnect())

  it("return 200 for /api/users", async () => {
    const payload: CreateUserPayload = fakeCreateUserPayload()
    const body = { commandName: "create_user", payload }
    const res = await request(app).post("/api/users").send(body).expect(200)

    expect(res.body.status).eql("ok")
    expect(res.body.id).satisfy(validate)
  })

  it("emit user_created event", async () => {
    const payload: CreateUserPayload = fakeCreateUserPayload()
    const body = { commandName: "create_user", payload }
    const res = await request(app).post("/api/users").send(body).expect(200)

    const userId = res.body.id
    await testConsumer.assertReceive((msg) => {
      const data = msg.payload as UserData & { id: string }
      return msg.eventName === UserCreated.EventName && data.id === userId && data.email === payload.email
    })
    const ret = await db.query<boolean[]>(sql`select published from aggregate_events where aggregate_id=${userId}`)
    expect(ret).lengthOf(1)
    expect(ret.every((r) => r)).true
  })
})

function fakeCreateUserPayload(): CreateUserPayload {
  return {
    firstName: name.firstName(),
    lastName: name.lastName(),
    dateOfBirth: new Date().toISOString(),
    email: internet.email(),
  }
}
