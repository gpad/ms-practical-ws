import { AggregateId, EventId } from "./ids"
import { DomainTrace } from "./domain_trace"

export class AggregateVersion {
  readonly type = "aggregate_version"
  static readonly Empty: AggregateVersion = new AggregateVersion(-1, -1)
  constructor(readonly version: number, readonly index: number) {}

  static from({
    aggregateVersion,
    aggregateVersionIndex,
  }: {
    aggregateVersion: number
    aggregateVersionIndex: number
  }): AggregateVersion {
    return new AggregateVersion(aggregateVersion, aggregateVersionIndex)
  }

  eq(v: AggregateVersion): boolean {
    return this.version === v.version && this.index === v.index
  }

  equals(v: AggregateVersion): boolean {
    return this.eq(v)
  }

  gt(v: AggregateVersion): boolean {
    if (this.version < v.version) return false
    if (this.version === v.version) return this.index > v.index
    return true
  }

  lt(v: AggregateVersion): boolean {
    if (this.version > v.version) return false
    if (this.version === v.version) return this.index < v.index
    return true
  }

  toString() {
    return `${AggregateVersion.name}(${this.version}, ${this.index})`
  }
}

export interface EnrichOptions {
  trace: DomainTrace
  version: AggregateVersion
}

export abstract class DomainEvent {
  constructor(
    readonly id: EventId,
    readonly aggregateId: AggregateId,
    readonly eventName: string,
    readonly aggregateVersion: AggregateVersion,
    readonly domainTrace: DomainTrace
  ) {}

  abstract enrich({ trace, version }: EnrichOptions): DomainEvent
}

export abstract class PublicDomainEvent extends DomainEvent {
  constructor(
    readonly id: EventId,
    readonly aggregateId: AggregateId,
    readonly eventName: string,
    readonly aggregateVersion: AggregateVersion,
    readonly domainTrace: DomainTrace,
    readonly version: string = "1.0.0"
  ) {
    super(id, aggregateId, eventName, aggregateVersion, domainTrace)
  }

  abstract toPayload(): unknown
}

export abstract class Aggregate<T extends AggregateId> {
  private _id: T
  private _version: number
  private _pendingEvents: DomainEvent[] = []

  constructor(id: T, version: number, events: DomainEvent[]) {
    this._id = id
    this._pendingEvents = events
    this._version = version
  }

  get id(): T {
    return this._id
  }

  get version(): number {
    return this._version
  }

  get pendingEvents(): DomainEvent[] {
    return this._pendingEvents
  }

  protected addPendingEvents(event: DomainEvent) {
    this._pendingEvents.push(event)
  }

  commitEvents(): DomainEvent[] {
    return this._pendingEvents.splice(0)
  }
}
