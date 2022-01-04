import { NextFunction, Request, Response } from "express"
import { CommandId } from "../infra/ids"
import { CommandBus } from "../infra/local_command_bus"
import { DomainTrace } from "../infra/domain_trace"
import { Command } from "../infra/command"
import { User, UserData, UserId } from "../user/user"
import { CreateUserCommand } from "../user/create_user_command"

export const urlForCreateUser = function (commandBus: CommandBus) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cmd = creatUserCommandFrom(req)
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

function creatUserCommandFrom(req: Request): Command {
  const commandId = CommandId.new()
  const domainTrace = DomainTrace.extractFromHeaders(req.headers, commandId)
  const { payload } = check<{ commandName: string; payload: UserData }>(req.body)
  return CreateUserCommand.create(commandId, UserId.new(), payload, domainTrace)
}

function check<T>(body: unknown): T {
  if (typeof body === "object" && body) {
    return body as unknown as T
  }
  throw new Error("Invalid Object")
}
