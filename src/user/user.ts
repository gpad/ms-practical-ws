import { Aggregate, AggregateVersion, DomainEvent, EnrichOptions, PublicDomainEvent } from "../infra/aggregate"
import { AggregateId, EventId } from "../infra/ids"
import { DomainTrace } from "../infra/domain_trace"

export class UserId extends AggregateId<"user_id"> {
  readonly type = "user_id"
}

export interface UserData {
  dateOfBirth: Date | null
  confirmedAt: Date | null
  firstName: string
  lastName: string
  email: string
}

export class UserCreated extends PublicDomainEvent {
  static readonly EventName = "user_created"

  constructor(
    id: EventId,
    readonly userId: UserId,
    readonly userData: UserData,
    aggregateVersion: AggregateVersion,
    domainTrace: DomainTrace
  ) {
    super(id, userId, UserCreated.EventName, aggregateVersion, domainTrace)
  }

  enrich({ trace, version }: EnrichOptions): UserCreated {
    return new UserCreated(this.id, this.userId, this.userData, version, trace)
  }

  static create(userId: UserId, userData: UserData): UserCreated {
    const eventId = EventId.new()
    const domainTrace = DomainTrace.create(eventId)
    return new UserCreated(eventId, userId, userData, AggregateVersion.Empty, domainTrace)
  }

  toPayload() {
    return { id: this.userId.toValue(), ...this.userData }
  }
}

export interface EmailConfirmedPayload {
  email: string
  userId: string
}

export class EmailConfirmed extends PublicDomainEvent {
  static readonly EventName = "email_confirmed"

  constructor(
    id: EventId,
    readonly payload: EmailConfirmedPayload,
    aggregateVersion: AggregateVersion,
    domainTrace: DomainTrace
  ) {
    super(id, UserId.from(payload.userId), EmailConfirmed.EventName, aggregateVersion, domainTrace)
  }

  enrich({ trace, version }: EnrichOptions): DomainEvent {
    return new EmailConfirmed(this.id, this.payload, version, trace)
  }

  static create(userId: UserId, userData: UserData): UserCreated {
    const eventId = EventId.new()
    const domainTrace = DomainTrace.create(eventId)
    return new UserCreated(eventId, userId, userData, AggregateVersion.Empty, domainTrace)
  }

  toPayload() {
    return this.payload
  }
}

export class User extends Aggregate<UserId> {
  private _data: UserData
  constructor(id: UserId, data: UserData, version: number, events: DomainEvent[]) {
    super(id, version, events)
    this._data = data
  }

  static create(id: UserId, data: UserData) {
    const userCreated = UserCreated.create(id, data)
    return new User(id, data, 0, [userCreated])
  }

  updateData(data: UserData) {
    this._data = data
  }

  confirmEmail(email: string) {
    if (this._data.email !== email) {
      throw new Error(`Email ${email} is not associated to user id: ${this.id} - ${this._data.email}`)
    }
    this._data.confirmedAt = new Date()
  }

  public get data(): UserData {
    return this._data
  }
}
