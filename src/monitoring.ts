/* eslint-disable @typescript-eslint/no-explicit-any */
import { collectDefaultMetrics, Counter, Registry } from "prom-client"

// Create a Registry which registers the metrics
const register = new Registry()
collectDefaultMetrics({ register })

export const userCreatedCounter = new Counter({
  name: "created_users",
  help: "Number of created users",
})

// Register the histogram
register.registerMetric(userCreatedCounter)

export const registerPromMetrics = async (_req: any, res: any) => {
  try {
    res.set("Content-Type", register.contentType)
    res.end(await register.metrics())
  } catch (ex) {
    res.status(500).end(ex)
  }
}
