import { DomainEvent } from "../../src/infra/aggregate"
import { EventBus, EventHandler } from "../../src/infra/event_bus"

export class FakeEventBus implements EventBus {
  events: DomainEvent[] = []

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  register<T extends DomainEvent>(_eventName: string, _handler: EventHandler<T>): void {}

  emit<T extends DomainEvent>(event: T): Promise<void> {
    this.events.push(event)
    return Promise.resolve()
  }
  emits<T extends DomainEvent>(events: T[]): Promise<void> {
    events.forEach((e) => this.events.push(e))
    return Promise.resolve()
  }
}
