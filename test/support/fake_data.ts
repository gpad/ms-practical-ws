import { faker } from "@faker-js/faker"
import { JSONSchemaType } from "ajv"
import { randomUUID } from "node:crypto"
import { AggregateVersion, DomainEvent, EnrichOptions, PublicDomainEvent } from "../../src/infra/aggregate"
import { DomainTrace } from "../../src/infra/domain_trace"
import { EventId } from "../../src/infra/ids"
import { toUserCreatedPayload, User, UserCreatedPayload, UserData, UserId } from "../../src/user/user"
import { ajv } from "../../src/user/validation"
import { TestId } from "./test_id"

export function createUser() {
  return User.create(UserId.new(), createUserData())
}

export function createUserData(): UserData {
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    dateOfBirth: new Date(2006, 6, 6),
    email: faker.internet.email(),
    confirmedAt: null,
  }
}

export function createUserCreatedPayload(): UserCreatedPayload {
  return toUserCreatedPayload(UserId.new(), createUserData())
}

export function createFakePublicAggregateEvent(
  opts: Partial<SqlSchema.aggregate_events> = {}
): SqlSchema.aggregate_events {
  return {
    id: randomUUID(),
    aggregate_id: randomUUID(),
    aggregate_version: 0,
    aggregate_version_index: 1,
    causation_id: randomUUID(),
    correlation_id: randomUUID(),
    event_name: "test_name",
    payload: { value: randomUUID() },
    public: true,
    published: false,
    ...opts,
  }
}

export class TestDomainEvent extends DomainEvent {
  static readonly EventName = "test_domain_event"

  static create(): TestDomainEvent {
    const eventId = EventId.new()
    return new TestDomainEvent(eventId, { id: randomUUID() }, AggregateVersion.Empty, DomainTrace.create(eventId))
  }

  constructor(
    id: EventId,
    private readonly payload: { id: string },
    aggregateVersion: AggregateVersion,
    domainTrace: DomainTrace
  ) {
    super(id, TestId.from(payload.id), TestDomainEvent.EventName, aggregateVersion, domainTrace)
  }

  enrich({ trace, version }: EnrichOptions): TestDomainEvent {
    return new TestDomainEvent(this.id, this.payload, version, trace)
  }

  toPayload(): { id: string } {
    return this.payload
  }
}

interface TestPublicDomainEventPayload {
  id: string
}

const TestPublicDomainEventPayloadSchema: JSONSchemaType<TestPublicDomainEventPayload> = {
  type: "object",
  properties: { id: { type: "string", format: "uuid" } },
  required: ["id"],
  additionalProperties: false,
}

export const validateTestPublicDomainEventPayload = ajv.compile<TestPublicDomainEventPayload>(
  TestPublicDomainEventPayloadSchema
)

export class TestPublicDomainEvent extends PublicDomainEvent {
  static readonly EventName = "test_public_domain_event"

  static create(): PublicDomainEvent {
    const eventId = EventId.new()
    return new TestPublicDomainEvent(eventId, { id: randomUUID() }, AggregateVersion.Empty, DomainTrace.create(eventId))
  }

  constructor(
    id: EventId,
    private readonly payload: TestPublicDomainEventPayload,
    aggregateVersion: AggregateVersion,
    domainTrace: DomainTrace
  ) {
    super(id, TestId.from(payload.id), TestPublicDomainEvent.EventName, aggregateVersion, domainTrace)
  }

  enrich({ trace, version }: EnrichOptions): TestPublicDomainEvent {
    return new TestPublicDomainEvent(this.id, this.payload, version, trace)
  }

  toPayload(): TestPublicDomainEventPayload {
    return this.payload
  }
}
