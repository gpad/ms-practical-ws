import { DomainTrace } from "../infra/domain_trace"
import { EventBus, EventResult } from "../infra/event_bus"
import { CommandBus } from "../infra/local_command_bus"
import { ConfirmEmailCommand } from "./create_user_command"
import { EmailConfirmed, User, UserId } from "./user"

export class ConfirmationPolicy {
  constructor(private commandBus: CommandBus) {}

  registerTo(eventBus: EventBus) {
    eventBus.register<EmailConfirmed>(EmailConfirmed.EventName, (e) => this.confirmUser(e))
  }

  async confirmUser(e: EmailConfirmed): Promise<EventResult> {
    const cmd = ConfirmEmailCommand.create(UserId.from(e.payload.userId), e.payload.email, DomainTrace.createFrom(e))
    const res = await this.commandBus.execute<User>(cmd)
    if (res.success) {
      return { ack: true, payload: res.payload }
    }
    return { ack: true, payload: res.errors }
  }
}
