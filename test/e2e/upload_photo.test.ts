import request from "supertest"
import { getTestApp, getTestOptions } from "../support/test_app"
import { createUser } from "../support/fake_data"
import { configureLogger, connectToDb } from "../../src/app"
import { Db } from "../../src/infra/db"
import { UserRepository } from "../../src/user/user_repository"
import { FakeEventBus } from "../support/fake_event_bus"
import { EventId } from "../../src/infra/ids"
import { DomainTrace } from "../../src/infra/domain_trace"
import { TestConsumer } from "../support/test_consumer"
import { randomBytes, randomUUID } from "crypto"
import path from "path"
import { tmpdir } from "os"
import { rm, writeFile } from "fs"
import { Application } from "express"
import { faker } from "@faker-js/faker"
import { expect } from "chai"
import sql from "sql-template-tag"
import nock from "nock"

describe("Upload photo", async () => {
  let app: Application
  const user = createUser()
  const opts = getTestOptions()
  const storageServiceUrl = opts.storageServiceUrl
  const logger = configureLogger(opts.logger)
  const fakeEventBus = new FakeEventBus()
  const domainTrace = DomainTrace.create(EventId.new())
  const testConsumer = new TestConsumer(opts.rabbitOptions.uri, logger)
  let db: Db
  let repository: UserRepository
  const photo = {
    path: path.join(tmpdir(), randomUUID()),
    content: randomBytes(512),
  }

  before(async () => {
    app = await getTestApp()
    const res = await connectToDb(opts.dbOptions, logger)
    db = res.db
    repository = new UserRepository(db, fakeEventBus)
  })

  beforeEach(() => db.query(sql`TRUNCATE users CASCADE`))
  beforeEach(() => repository.save(user, domainTrace, logger))
  beforeEach(() => testConsumer.start())
  beforeEach((done) => writeFile(photo.path, photo.content, done))

  afterEach(() => testConsumer.disconnect())
  afterEach((done) => rm(photo.path, done))

  it("on existing user return a photo id", async () => {
    const scope = nock(storageServiceUrl).post(`/api/photo/${user.id.toValue()}`).reply(200, { id: randomUUID() })

    const res = await request(app)
      .post(`/api/users/${user.id.toValue()}/photo`)
      .field("longitude", faker.location.longitude())
      .field("latitude", faker.location.latitude())
      .attach("photo", photo.path)
      .expect(200)

    expect(res.body).eql({ status: "ok" })
    expect(scope.isDone()).true
  })

  it("on unknown user return 400", async () => {
    const unknownUserId = randomUUID()

    const res = await request(app)
      .post(`/api/users/${unknownUserId}/photo`)
      .field("longitude", faker.location.longitude())
      .field("latitude", faker.location.latitude())
      .attach("photo", photo.path)
      .expect(400)

    expect(res.body).eql({ errors: [`Unable to find user ${unknownUserId} for upload photo`] })
  })
})
