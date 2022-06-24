import { inspect } from "util"
import { Logger } from "winston"
import { CommandBus, CommandResult } from "../infra/local_command_bus"
import { ConfirmEmailCommand, CreateUserCommand, UploadPhotoCommand } from "./create_user_command"
import { User, UserId } from "./user"
import { UserRepository } from "./user_repository"
import got from "got"
import FormData from "form-data"
import { userCreatedCounter } from "../monitoring"

export class UserCommandHandler {
  constructor(private readonly repository: UserRepository, private readonly storageServiceUrl: string) {}

  registerTo(commandBus: CommandBus) {
    commandBus.register(CreateUserCommand.CommandName, (cmd: CreateUserCommand, logger: Logger) =>
      this.createCommand(cmd, logger)
    )
    commandBus.register(ConfirmEmailCommand.CommandName, (cmd: ConfirmEmailCommand, logger: Logger) =>
      this.confirmEmail(cmd, logger)
    )
    commandBus.register(UploadPhotoCommand.CommandName, (cmd: UploadPhotoCommand, logger: Logger) =>
      this.uploadPhoto(cmd, logger)
    )
  }
  private async createCommand(cmd: CreateUserCommand, logger: Logger): Promise<CommandResult<User>> {
    logger.info(`Create user ${inspect(cmd)}`)
    const user = User.create(cmd.userId, cmd.data)
    await this.repository.save(user, cmd.domainTrace, logger)
    userCreatedCounter.inc()
    return { success: true, payload: user }
  }

  private async confirmEmail(cmd: ConfirmEmailCommand, logger: Logger): Promise<CommandResult<User>> {
    logger.info(`Confirm email for ${inspect(cmd)}`)
    const user = await this.repository.getById(cmd.userId)
    user.confirmEmail(cmd.email)
    await this.repository.save(user, cmd.domainTrace, logger)
    return { success: true, payload: user }
  }

  private async uploadPhoto(cmd: UploadPhotoCommand, logger: Logger): Promise<CommandResult<{ photoId: string }>> {
    if (!(await this.repository.findById(cmd.userId))) {
      return { success: false, errors: [`Unable to find user ${cmd.userId.toValue()} for upload photo`] }
    }
    const url = `${this.storageServiceUrl}/api/photo/${cmd.userId.toValue()}`
    logger.info(`Uploading photo to ${url} for cmd: ${inspect(cmd)}`)
    const formData = new FormData()
    formData.append("file", cmd.photo)
    const ret = await got.post(url, { body: formData }).json<{ id: string }>()
    logger.info(`photo uploaded with ret: ${inspect(ret)}`)
    return { success: true, payload: { photoId: ret.id } }
  }
}
