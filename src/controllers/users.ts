import { NextFunction, Request, Response } from "express"
import { CommandId } from "../infra/ids"
import { CommandBus } from "../infra/local_command_bus"
import { DomainTrace } from "../infra/domain_trace"
import { User, UserData, UserId } from "../user/user"
import { CreateUserCommand, UploadPhotoCommand } from "../user/create_user_command"
import { isArray } from "lodash"

export const createUser = function (commandBus: CommandBus) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cmd = createUserCommandFrom(req)
      const ret = await commandBus.execute<User>(cmd)
      if (!ret.success) {
        res.status(400).json({ errors: ret.errors })
        return
      }
      res.status(200).json({ status: "ok", id: ret.payload.id.toValue() })
    } catch (e) {
      next(e as Error)
    }
  }
}

export function uploadPhoto(commandBus: CommandBus) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cmd = uploadPhotoCommandFrom(req)
      const ret = await commandBus.execute(cmd)
      if (!ret.success) {
        res.status(400).json({ errors: ret.errors })
        return
      }
      res.status(200).json({ status: "ok" })
    } catch (e) {
      next(e as Error)
    }
  }
}

function createUserCommandFrom(req: Request): CreateUserCommand {
  const commandId = CommandId.new()
  const domainTrace = DomainTrace.extractFromHeaders(req.headers, commandId)
  const { payload } = check<{ commandName: string; payload: UserData }>(req.body)
  return CreateUserCommand.create(commandId, UserId.new(), payload, domainTrace)
}

function uploadPhotoCommandFrom(req: Request): UploadPhotoCommand {
  const commandId = CommandId.new()
  const domainTrace = DomainTrace.extractFromHeaders(req.headers, commandId)
  const x = isArray(req.files) ? req.files[0] : null
  if (!x) throw new Error("Unable to decode file")
  return UploadPhotoCommand.create(commandId, UserId.from(req.params.id), x.buffer, domainTrace)
}

function check<T>(body: unknown): T {
  if (typeof body === "object" && body) {
    return body as unknown as T
  }
  throw new Error("Invalid Object")
}
