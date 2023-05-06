import { NextFunction, Request, Response } from "express"
import { CommandBus } from "../infra/local_command_bus"
import Ajv from "ajv"
import addFormats from "ajv-formats"
import { ExecuteHeavyStuffCommand, HeavyStuffId } from "../heavy_stuff/heavy_stuff"
import { CommandId } from "../infra/ids"
import { DomainTrace } from "../infra/domain_trace"
import { isString } from "lodash"
import { inspect } from "util"
const ajv = new Ajv({ strict: true })
addFormats(ajv)

export const execute = function (commandBus: CommandBus) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cmd = createExecuteHeavyStuffCommandFrom(req)
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

function createExecuteHeavyStuffCommandFrom(req: Request): ExecuteHeavyStuffCommand {
  const commandId = CommandId.new()
  const domainTrace = DomainTrace.extractFromHeaders(req.headers, commandId)
  const timeout = req.query.timeout
  if (!isString(timeout) || !Number.isInteger(parseInt(timeout))) {
    throw new Error(`Query ${inspect(req.query)}, should contains timeout`)
  }
  return ExecuteHeavyStuffCommand.create(commandId, HeavyStuffId.new(), parseInt(timeout), domainTrace)
}
