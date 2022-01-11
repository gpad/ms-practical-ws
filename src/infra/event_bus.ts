import { Logger } from "winston"
import { DomainEvent, PublicDomainEvent } from "./aggregate"
import { RabbitMessage } from "./rabbit"

export interface EventResult {
  ack: boolean
  // payload: unknown
}
export type EventHandler<T extends DomainEvent> = (e: T, logger: Logger) => Promise<EventResult>
// export type EventHandler<T extends DomainEvent> = (e: T, logger: Logger) => Promise<void>

export interface EventBus {
  register<T extends DomainEvent>(eventName: string, handler: EventHandler<T>): void
  emit<T extends DomainEvent>(event: T): Promise<void>
}

export function toMessage(event: PublicDomainEvent): RabbitMessage {
  return {
    causationId: event.domainTrace.causationId.toValue(),
    correlationId: event.domainTrace.correlationId.toValue(),
    eventName: event.eventName,
    messageId: event.id.toValue(),
    aggregateVersion: event.aggregateVersion.version,
    aggregateVersionIndex: event.aggregateVersion.index,
    payload: event.toPayload(),
  }
}
