import { Logger } from "winston"
import { DomainTrace } from "../infra/domain_trace"
import { EventBus, EventResult } from "../infra/event_bus"
import { CommandBus } from "../infra/local_command_bus"
import { ConfirmEmailCommand } from "./create_user_command"
import { EmailConfirmed, User, UserConfirmed, UserId } from "./user"

export class ConfirmationPolicy {
  constructor(private commandBus: CommandBus) {}

  registerTo(eventBus: EventBus) {
    eventBus.register<EmailConfirmed>(EmailConfirmed.EventName, (e) => this.confirmUser(e))
    eventBus.register<UserConfirmed>(UserConfirmed.EventName, (e, l) => this.userConfirmed(e, l))
  }

  async confirmUser(e: EmailConfirmed): Promise<EventResult> {
    const cmd = ConfirmEmailCommand.create(UserId.from(e.payload.userId), e.payload.email, DomainTrace.createFrom(e))
    await this.commandBus.execute<User>(cmd)
    return { ack: true }
  }

  userConfirmed(e: UserConfirmed, logger: Logger): Promise<EventResult> {
    logger.info(`User ${e.id} ${e.payload.firstName} confirmed at: ${e.payload.confirmedAt}`)
    return Promise.resolve({ ack: true })
  }
}
