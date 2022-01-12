import { NextFunction, Request, Response } from "express"
import { CommandId } from "../infra/ids"
import { CommandBus } from "../infra/local_command_bus"
import { DomainTrace } from "../infra/domain_trace"
import { User, UserData, UserId } from "../user/user"
import { CreateUserCommand, UploadPhotoCommand } from "../user/create_user_command"
import { isArray } from "lodash"
import Ajv from "ajv"
import addFormats from "ajv-formats"
import { inspect } from "util"
const ajv = new Ajv({ strict: true })
addFormats(ajv)

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
  const { payload } = check(req.body)
  return CreateUserCommand.create(commandId, UserId.new(), toUserData(payload), domainTrace)
}

function uploadPhotoCommandFrom(req: Request): UploadPhotoCommand {
  const commandId = CommandId.new()
  const domainTrace = DomainTrace.extractFromHeaders(req.headers, commandId)
  const x = isArray(req.files) ? req.files[0] : null
  if (!x) throw new Error("Unable to decode file")
  return UploadPhotoCommand.create(commandId, UserId.from(req.params.id), x.buffer, domainTrace)
}

interface CreateUserPayload {
  dateOfBirth?: string | null
  email: string
  firstName: string
  lastName: string
}

const CreateUserPayloadSchema = {
  $id: "CreateUserPayload",
  type: "object",
  properties: {
    dateOfBirth: { type: "string", format: "date-time", nullable: true },
    email: { type: "string" },
    firstName: { type: "string" },
    lastName: { type: "string" },
  },
  required: ["email", "firstName", "lastName"],
  additionalProperties: false,
}

ajv.compile<CreateUserPayload>(CreateUserPayloadSchema)

interface CreateUserBody {
  commandName: "create_user"
  payload: CreateUserPayload
}

const CreateUserBodySchema = {
  type: "object",
  properties: {
    commandName: { const: "create_user" },
    payload: { $ref: "CreateUserPayload" },
  },
}

const validateCreateUserBodySchema = ajv.compile<CreateUserBody>(CreateUserBodySchema)

function check(body: unknown) {
  if (!validateCreateUserBodySchema(body))
    throw new Error(`Unable to parse ${inspect(body)}, errors: ${validateCreateUserBodySchema.errors}`)

  return body
}

function toUserData(payload: CreateUserPayload): UserData {
  return {
    ...payload,
    confirmedAt: null,
    dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth) : null,
  }
}
