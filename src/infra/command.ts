import { AggregateId, CommandId } from "./ids"
import { DomainTrace } from "./domain_trace"

export abstract class Command {
  constructor(
    readonly id: CommandId,
    readonly aggregateId: AggregateId,
    readonly commandName: string,
    readonly domainTrace: DomainTrace
  ) {}
}
