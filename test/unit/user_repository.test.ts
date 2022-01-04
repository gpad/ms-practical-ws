import { expect } from "chai"
import { internet, name } from "faker"
import { configureLogger, connectToDb } from "../../src/app"
import { Db } from "../../src/infra/db"
import { DomainTrace } from "../../src/infra/domain_trace"
import { EventId } from "../../src/infra/ids"
import { User, UserId } from "../../src/user/user"
import { UserRepository } from "../../src/user/user_repository"
import { FakeEventBus } from "../support/fake_event_bus"
import { createUser } from "../support/fake_data"
import { getTestOptions } from "../support/test_app"

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
      firstName: name.firstName(),
      lastName: name.lastName(),
      dateOfBirth: new Date(2006, 6, 6),
      email: internet.email(),
      confirmedAt: null,
    })
    const repository = new UserRepository(db, fakeEventBus)
    await repository.save(user, domainTrace, logger)

    const fromDb = await repository.getById(user.id)

    expect(fromDb.id).eql(user.id)
    expect(fromDb.data).eql(user.data)
  })

  it("update user", async () => {
    const user = await createUserInDb()
    user.updateData({
      firstName: name.firstName(),
      lastName: name.lastName(),
      dateOfBirth: new Date(2007, 7, 7),
      email: internet.email(),
      confirmedAt: new Date(),
    })
    const repository = new UserRepository(db, fakeEventBus)
    await repository.save(user, domainTrace, logger)

    const fromDb = await repository.getById(user.id)

    expect(fromDb.id).eql(user.id)
    expect(fromDb.data).eql(user.data)
  })
})
