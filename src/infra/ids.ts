import { isEmpty } from "lodash"
import { v4 as uuid } from "uuid"

export abstract class GenericId<T extends string = string> {
  abstract readonly type: T

  constructor(private readonly value: string) {
    if (isEmpty(value)) throw new TypeError(`Received empty value for ${this.constructor}`)
  }

  equals(other: GenericId<T>): boolean {
    if (!(other instanceof GenericId)) {
      return false
    }
    return other.type === this.type && other.toValue() === this.toValue()
  }

  toString() {
    return `[${this.type}:${this.value}]`
  }

  toValue(): string {
    return this.value
  }

  static from<IdType>(this: { new (_value: string): IdType }, value: string): IdType {
    return new this(value)
  }

  static new<IdType>(this: { new (value: string): IdType }): IdType {
    return new this(uuid())
  }
}

export abstract class AggregateId<T extends string = string> extends GenericId<T> {}

export class CorrelationId extends GenericId<"correlation_id"> {
  readonly type = "correlation_id"
}

export class CausationId extends GenericId<"causation_id"> {
  readonly type = "causation_id"
}

export class EventId extends GenericId<"event_id"> {
  readonly type = "event_id"
}

export class CommandId extends GenericId<"command_id"> {
  readonly type = "command_id"
}
