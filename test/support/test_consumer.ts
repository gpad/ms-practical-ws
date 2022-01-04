import { expect } from "chai"
import { inspect } from "util"
import { Logger } from "winston"
import { Rabbit, RabbitMessage } from "../../src/infra/rabbit"
import { elapsedFrom, wait } from "../../src/infra/wait"

export class TestConsumer extends Rabbit {
  async disconnect(): Promise<void> {
    this.reset()
    return super.disconnect()
  }
  private messages: RabbitMessage[] = []

  constructor(uri: string, logger: Logger) {
    super(uri, "ms-template", 50, logger)
  }

  assertNotReceived(predicate: (m: RabbitMessage) => boolean) {
    const msg = this.messages.find(predicate)
    if (msg) {
      expect.fail(`Found message ${inspect(msg)} in messages ${this.prettyMessages()}`)
    }
  }

  async assertReceive(predicate: (msg: RabbitMessage) => boolean, timeout = 1500) {
    const start = Date.now()
    while (!this.messages.some(predicate)) {
      await wait(5)
      if (elapsedFrom(start) > timeout) {
        expect.fail("The predicate is always false in " + this.prettyMessages())
      }
    }
  }

  async start() {
    try {
      this.reset()
      await super.connect()
      await super.startConsumer(
        (msg) => {
          const rabbitMessage = JSON.parse(msg.content.toString()) as RabbitMessage
          this.messages.push(rabbitMessage)
          return Promise.resolve()
        },
        { queueName: "test_consumer", bindingKey: "#", exchange: "events", temporary: true }
      )
    } catch (error) {
      throw error
    }
  }

  reset() {
    this.messages.length = 0
  }

  private prettyMessages() {
    if (this.messages.length === 0) {
      return "[]"
    }
    return this.messages.map((m) => `(${inspect(m)})`).join(", ")
  }
}

// export function createJWT(jwtKey = process.env.JWT_KEY as string) {
//   return jwt.sign(
//     {
//       username: "other-service",
//       administrator: true,
//     },
//     jwtKey,
//     { expiresIn: "3 minutes" }
//   )
// }

// export class StubFeatureFlags extends FeatureFlags {
//   private features = new Map<string, boolean>()

//   set(feature: string, value: boolean) {
//     this.features.set(feature, value)
//   }

//   isEnabled(feature: string): Promise<boolean> {
//     return Promise.resolve(this.features.has(feature) ? (this.features.get(feature) as boolean) : true)
//   }

//   reset() {
//     this.features.clear()
//   }
// }

// export class TestFeatureFlags extends SqlFeatureFlags {
//   async disableAll(): Promise<void> {
//     await this.db.run(sql`
//         delete from feature_flag
//     `)
//   }

//   async disable(feature: string): Promise<void> {
//     await this.db.run(sql`
//         INSERT INTO feature_flag (feature, active) VALUES (${feature}, false)
//         ON CONFLICT (feature) DO UPDATE
//         SET active = false
//     `)
//   }

//   async enable(feature: string): Promise<void> {
//     await this.db.run(sql`
//         INSERT INTO feature_flag (feature, active) VALUES (${feature}, true)
//         ON CONFLICT (feature) DO UPDATE
//         SET active = true
//     `)
//   }
// }

// export function createPublishObject(opts: {
//   exchange: string
//   routingKey: string
//   eventType: string
//   payload: unknown
// }): OutgoingDomainMessage {
//   const pubObj = {
//     correlationId: CorrelationId.new().toValue(),
//     causationId: CausationId.new().toValue(),
//     messageId: EventId.new().toValue(),
//     aggregateVersion: 1,
//     aggregateVersionIndex: 1,
//     version: "6.6.6",
//   }

//   return { ...pubObj, ...opts }
// }

// export function toPublishObject(event: PublicDomainEvent, microServiceName: string = "test"): OutgoingDomainMessage {
//   return {
//     exchange: ServiceEventBus.EventExchangeName,
//     routingKey: `event.${microServiceName}.${event.eventType}`,
//     eventType: event.eventType,
//     payload: event.toPayload(),
//     correlationId: event.domainTrace.correlationId.toValue(),
//     causationId: event.domainTrace.causationId.toValue(),
//     messageId: event.id.toValue(),
//     aggregateVersion: event.aggregateVersion.version,
//     aggregateVersionIndex: event.aggregateVersion.index,
//     version: event.version,
//   }
// }
