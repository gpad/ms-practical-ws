import { CommandId } from "../infra/ids"
import { DomainTrace } from "../infra/domain_trace"
import { Command } from "../infra/command"
import { UserData, UserId } from "./user"

export class CreateUserCommand extends Command {
  static CommandName = "create_user"
  static create(id: CommandId, userId: UserId, data: UserData, domainTrace: DomainTrace) {
    return new CreateUserCommand(id, userId, data, domainTrace)
  }
  constructor(id: CommandId, readonly userId: UserId, readonly data: UserData, domainTrace: DomainTrace) {
    super(id, userId, CreateUserCommand.CommandName, domainTrace)
  }
}

export class ConfirmEmailCommand extends Command {
  static CommandName = "confirm_email"
  static create(userId: UserId, email: string, domainTrace: DomainTrace) {
    const cmdId = CommandId.new()
    return new ConfirmEmailCommand(cmdId, userId, email, domainTrace)
  }
  constructor(id: CommandId, readonly userId: UserId, readonly email: string, domainTrace: DomainTrace) {
    super(id, userId, ConfirmEmailCommand.CommandName, domainTrace)
  }
}
