export type DbOptions = {
  host: string
  pwd: string
  user: string
  db: string
}

export type RabbitOptions = {
  uri: string
  tmpQueue: boolean
}

export type AppOptions = {
  env: string
  port: number
  logger: { silentLog: boolean; logLevel: string }
  dbOptions: DbOptions
  rabbitOptions: RabbitOptions
}

export function getAppOptions(): AppOptions {
  const env = process.env.NODE_ENV || "dev"
  return {
    env,
    port: parseInt(process.env.PORT || "3000"),
    logger: {
      silentLog: (process.env.SILENT_LOG || "FALSE") === "TRUE",
      logLevel: process.env.LOG_LEVEL || "debug",
    },
    dbOptions: {
      host: process.env.POSTGRES_HOST || "localhost",
      user: process.env.POSTGRES_USER || "postgres",
      pwd: process.env.POSTGRES_PASSWORD || "postgres",
      db: process.env.POSTGRES_DB || "ms_template_dev",
    },
    rabbitOptions: {
      uri: process.env.AMQP_URI || "amqp://guest:guest@localhost:5672",
      tmpQueue: env === "test",
    },
  }
}
