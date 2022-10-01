import { expect } from "chai"
import { faker } from "@faker-js/faker"
import { configureLogger, connectToDb } from "../../src/app"
import { Db } from "../../src/infra/db"
import { DomainTrace } from "../../src/infra/domain_trace"
import { EventId } from "../../src/infra/ids"
import { User, UserId } from "../../src/user/user"
import { UserRepository } from "../../src/user/user_repository"
import { FakeEventBus } from "../support/fake_event_bus"
import { createUser } from "../support/fake_data"
import { getTestOptions } from "../support/test_app"
import sql from "sql-template-tag"

describe("UserRepository", () => {
  const opts = getTestOptions()
  const logger = configureLogger(opts.logger)
  const fakeEventBus = new FakeEventBus()
  const domainTrace = DomainTrace.create(EventId.new())
  let db: Db

  async function createUserInDb() {
    const user = createUser()
    const repository = new UserRepository(db, fakeEventBus)
    await repository.save(user, domainTrace, logger)
    const fromDb = await repository.getById(user.id)
    return fromDb
  }

  beforeEach(async () => {
    const res = await connectToDb(opts.dbOptions, logger)
    db = res.db
  })

  it("save and load user", async () => {
    const user = User.create(UserId.new(), {
      firstName: faker.name.firstName(),
      lastName: faker.name.lastName(),
      dateOfBirth: new Date(2006, 6, 6),
      email: faker.internet.email(),
      confirmedAt: null,
    })
    const repository = new UserRepository(db, fakeEventBus)
    await repository.save(user, domainTrace, logger)

    const fromDb = await repository.getById(user.id)

    expect(fromDb.id).eql(user.id)
    expect(fromDb.data).eql(user.data)
  })

  it("save a new user and all events are emitted", async () => {
    const user = User.create(UserId.new(), {
      firstName: faker.name.firstName(),
      lastName: faker.name.lastName(),
      dateOfBirth: new Date(2006, 6, 6),
      email: faker.internet.email(),
      confirmedAt: null,
    })
    const repository = new UserRepository(db, fakeEventBus)
    await repository.save(user, domainTrace, logger)

    const ret = await db.query<boolean[]>(
      sql`select published from aggregate_events where aggregate_id=${user.id.toValue()}`
    )
    expect(ret).lengthOf(1)
    expect(ret.every((r) => r)).true
  })

  it("update user", async () => {
    const user = await createUserInDb()
    user.updateData({
      firstName: faker.name.firstName(),
      lastName: faker.name.lastName(),
      dateOfBirth: new Date(2007, 7, 7),
      email: faker.internet.email(),
      confirmedAt: new Date(),
    })
    const repository = new UserRepository(db, fakeEventBus)
    await repository.save(user, domainTrace, logger)

    const fromDb = await repository.getById(user.id)

    expect(fromDb.id).eql(user.id)
    expect(fromDb.data).eql(user.data)
  })

  it("save doesn't file also if eventBus raise exception", async () => {
    const user = createUser()
    const repository = new UserRepository(db, fakeEventBus)
    fakeEventBus.raiseOnEmit()

    await repository.save(user, domainTrace, logger)

    const fromDb = await repository.getById(user.id)
    expect(fromDb.id).eql(user.id)
    expect(fromDb.data).eql(user.data)
  })
})
