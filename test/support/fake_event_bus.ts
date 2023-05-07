import { DomainEvent } from "../../src/infra/aggregate"
import { EventBus, EventHandler } from "../../src/infra/event_bus"

export class FakeEventBus implements EventBus {
  private _raiseOnEmit: Error | null = null
  events: DomainEvent[] = []

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  register<T extends DomainEvent>(_eventName: string, _handler: EventHandler<T>): void {}

  emit<T extends DomainEvent>(event: T): Promise<void> {
    if (this._raiseOnEmit) {
      throw this._raiseOnEmit
    }
    this.events.push(event)
    return Promise.resolve()
  }
  emits<T extends DomainEvent>(events: T[]): Promise<void> {
    return Promise.all(events.map((e) => this.emit(e))).then()
  }

  raiseOnEmit(error: Error = new Error("Raise on error")) {
    this._raiseOnEmit = error
  }

  reset() {
    this._raiseOnEmit = null
    this.events.splice(0)
  }
}
