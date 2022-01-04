import { IncomingHttpHeaders } from "http"
import { CausationId, CommandId, CorrelationId, EventId, GenericId } from "./ids"

export class DomainTrace {
  constructor(readonly correlationId: CorrelationId, readonly causationId: CausationId) {}

  static create(id: EventId) {
    return new DomainTrace(CorrelationId.from(id.toValue()), CausationId.from(id.toValue()))
  }

  static createFrom(obj: { domainTrace: DomainTrace; id: EventId | CommandId }) {
    return new DomainTrace(obj.domainTrace.correlationId, CausationId.from(obj.id.toValue()))
  }

  // static extractFromMessage(msg: unknown) {
  //   return new DomainTrace(CorrelationId.from(msg.correlationId), CausationId.from(msg.causationId))
  // }
  static extractFromHeaders(headers: IncomingHttpHeaders, def: GenericId) {
    const correlationId = CorrelationId.from((headers["x-correlation-id"] as string) || def.toValue())
    const causationId = CausationId.from((headers["x-causation-id"] as string) || def.toValue())
    return new DomainTrace(correlationId, causationId)
  }
}
