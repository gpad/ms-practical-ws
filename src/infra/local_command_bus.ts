import { random } from "lodash"
import { inspect } from "util"
import { Logger } from "winston"
import { ConcurrencyError } from "../user/user_repository"
import { Command } from "./command"
import { elapsedFrom, wait } from "./wait"

interface FailCommandResult {
  success: false
  errors: string[]
}

interface SuccessCommandResult<T> {
  success: true
  payload: T
}

export type CommandResult<T> = FailCommandResult | SuccessCommandResult<T>
export type CommandHandler<T extends Command, U> = (cmd: T, logger: Logger) => Promise<CommandResult<U>>

export interface CommandBus {
  execute<T>(cmd: Command): Promise<CommandResult<T>>
  register<T extends Command, U>(commandName: string, handler: CommandHandler<T, U>): void
}

export class LocalCommandBus implements CommandBus {
  private handlers: { [key: string]: CommandHandler<never, unknown> } = {}
  private cmdTimeout = 30000

  constructor(private readonly logger: Logger) {}

  register<T extends Command, U>(commandName: string, handler: CommandHandler<T, U>) {
    if (this.alreadyRegister(commandName)) {
      throw new Error(`${commandName} is already registered!`)
    }
    this.handlers[commandName] = handler
  }

  execute<T extends Command, U>(cmd: T): Promise<CommandResult<U>> {
    const logger = this.logger.child({
      domainTrace: {
        correlationId: cmd.domainTrace.correlationId.toValue(),
        causationId: cmd.domainTrace.causationId.toValue(),
        cmdId: cmd.id.toValue(),
        commandName: cmd.commandName,
        aggregateId: cmd.aggregateId,
      },
    })
    const handler = this.handlers[cmd.commandName] as CommandHandler<T, U>
    if (!handler) {
      throw new Error(`Unable to find an handler for ${inspect(cmd)}!`)
    }
    // return Promise.resolve({ success: false, errors: [`Command ${inspect(cmd)} is unknown `] })

    try {
      return this.retry<T, U>(handler, cmd, logger)
    } catch (error) {
      logger.error(`Failed running command handler ${handler} on command ${inspect(cmd)} ${inspect(error)}`)
      return Promise.resolve({ success: false, errors: [(error as Error).toString()] })
    }
  }

  private alreadyRegister(commandName: string) {
    return !!this.handlers[commandName]
  }

  private async retry<T extends Command, U>(
    handler: CommandHandler<T, U>,
    cmd: T,
    logger: Logger
  ): Promise<CommandResult<U>> {
    const start = Date.now()
    while (true) {
      try {
        const ret = await handler(cmd, logger)
        logger.info(`Executed command: ${inspect(cmd)} in ${elapsedFrom(start)} ms, ret: ${inspect(ret)}`)
        return ret
      } catch (error) {
        if (!(error instanceof ConcurrencyError) || elapsedFrom(start) > this.cmdTimeout) {
          logger.error(
            `Unrecoverable error ${inspect(error)} on command ${inspect(cmd)} after ${elapsedFrom(
              start
            )} ms, timeout: ${this.cmdTimeout} ms.`
          )
          throw error
        }
        logger.warn(
          `ConcurrencyError try to attempt again commandId: ${cmd.id}, elapsed: ${elapsedFrom(start)} ms, timeout: ${
            this.cmdTimeout
          }`
        )
        await wait(random(10))
      }
    }
  }
}
