import { trace } from "@opentelemetry/api"
import { Command } from "../infra/command"
import { DomainTrace } from "../infra/domain_trace"
import { AggregateId, CommandId } from "../infra/ids"
import { LocalCommandBus } from "../infra/local_command_bus"
import { wait } from "../infra/wait"

export class HeavyStuffId extends AggregateId<"heavy_stuff_id"> {
  readonly type = "heavy_stuff_id"
}

export class ExecuteHeavyStuffCommand extends Command {
  static CommandName = "execute_heavy_stuff"

  static create(id: CommandId, heavyStuffId: HeavyStuffId, timeout: number, domainTrace: DomainTrace) {
    return new ExecuteHeavyStuffCommand(id, heavyStuffId, timeout, domainTrace)
  }

  constructor(id: CommandId, readonly heavyStuffId: HeavyStuffId, readonly timeout: number, domainTrace: DomainTrace) {
    super(id, heavyStuffId, ExecuteHeavyStuffCommand.CommandName, domainTrace)
  }
}

export class HeavyStuffCommandHandler {
  constructor(private tracerName: string) {}
  registerTo(commandBus: LocalCommandBus) {
    commandBus.register(ExecuteHeavyStuffCommand.CommandName, async (cmd: ExecuteHeavyStuffCommand) => {
      const doHeavyStuffTrace = trace.getTracer(this.tracerName)
      await doHeavyStuffTrace.startActiveSpan(cmd.commandName, async (span) => {
        await wait(cmd.timeout)
        span.end()
      })

      return { success: true, payload: cmd.timeout }
    })
  }
}
