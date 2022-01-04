import { Application } from "express"
import { Server } from "http"
import createApp from "../../src/app"
import { AppOptions, getAppOptions } from "../../src/env"

let applicationTest: ReturnType<typeof createApp>

export function getTestOptions(): AppOptions {
  const opts = getAppOptions()
  const { dbOptions, logger } = opts
  return {
    ...opts,
    dbOptions: { ...dbOptions, db: process.env.POSTGRES_DB || "ms_template_test" },
    logger: { ...logger, silentLog: (process.env.SILENT_LOG || "TRUE") === "TRUE" },
  }
}

export function getTestApp(options: Partial<AppOptions> = {}) {
  const defOpts = getTestOptions()
  if (!applicationTest) applicationTest = createApp({ ...defOpts, ...options })
  return applicationTest
}

export function startServer(app: Application): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(app.get("port"), (err?: Error) => {
      if (err) return reject(err)
      resolve(server)
    })
  })
}

export function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}
