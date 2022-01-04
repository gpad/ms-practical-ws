import { getTestApp, getTestOptions } from "../support/test_app"
import { createUser } from "../support/fake_data"
import { eventually } from "../support/expect_util"
import { configureLogger, connectToDb } from "../../src/app"
import { Db } from "../../src/infra/db"
import { UserRepository } from "../../src/user/user_repository"
import { FakeEventBus } from "../support/fake_event_bus"
import { CausationId, CorrelationId, EventId } from "../../src/infra/ids"
import { DomainTrace } from "../../src/infra/domain_trace"
import { expect } from "chai"
import { TestConsumer } from "../support/test_consumer"
import { randomUUID } from "crypto"
import { EmailConfirmedPayload } from "../../src/user/user"

describe("Confirm user", async () => {
  const user = createUser()
  const opts = getTestOptions()
  const logger = configureLogger(opts.logger)
  const fakeEventBus = new FakeEventBus()
  const domainTrace = DomainTrace.create(EventId.new())
  const testConsumer = new TestConsumer(opts.rabbitOptions.uri, logger)
  let db: Db
  let repository: UserRepository

  before(async () => {
    await getTestApp()
    const res = await connectToDb(opts.dbOptions, logger)
    db = res.db
  })

  beforeEach(async () => {
    repository = new UserRepository(db, fakeEventBus)
    await repository.save(user, domainTrace, logger)
  })
  beforeEach(() => testConsumer.start())
  afterEach(() => testConsumer.disconnect())

  it("when receive email_confirmed", async () => {
    await emitEmailConfirmedEvent({ email: user.data.email, userId: user.id.toValue() })

    await eventually(async () => {
      const u = await repository.getById(user.id)
      expect(u.data.confirmedAt).is.ok
    })
  })

  function emitEmailConfirmedEvent(payload: EmailConfirmedPayload): Promise<void> {
    return testConsumer.publish({
      causationId: CausationId.new().toValue(),
      correlationId: CorrelationId.new().toValue(),
      eventName: "email_confirmed",
      messageId: randomUUID(),
      payload,
      aggregateVersion: 0,
      aggregateVersionIndex: 0,
    })
  }
})
