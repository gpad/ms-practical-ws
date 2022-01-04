import { inspect } from "util"
import { Logger } from "winston"
import { CommandBus, CommandResult } from "../infra/local_command_bus"
import { ConfirmEmailCommand, CreateUserCommand } from "./create_user_command"
import { User } from "./user"
import { UserRepository } from "./user_repository"

export class UserCommandHandler {
  constructor(private readonly repository: UserRepository) {}

  registerTo(commandBus: CommandBus) {
    commandBus.register(CreateUserCommand.CommandName, (cmd: CreateUserCommand, logger: Logger) =>
      this.createCommand(cmd, logger)
    )
    commandBus.register(ConfirmEmailCommand.CommandName, (cmd: ConfirmEmailCommand, logger: Logger) =>
      this.confirmEmail(cmd, logger)
    )
  }

  async confirmEmail(cmd: ConfirmEmailCommand, logger: Logger): Promise<CommandResult<unknown>> {
    logger.info(`Confirm email for ${inspect(cmd)}`)
    const user = await this.repository.getById(cmd.userId)
    user.confirmEmail(cmd.email)
    await this.repository.save(user, cmd.domainTrace, logger)
    return { success: true, payload: user }
  }

  async createCommand(cmd: CreateUserCommand, logger: Logger): Promise<CommandResult<User>> {
    logger.info(`Create user ${inspect(cmd)}`)
    const user = User.create(cmd.userId, cmd.data)
    await this.repository.save(user, cmd.domainTrace, logger)
    return { success: true, payload: user }
  }
}
