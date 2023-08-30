/* eslint-disable no-console */
import compression from "compression"
import express, { Application, json, urlencoded } from "express"
import { Logger, createLogger, format, transports } from "winston"
import morgan, { token } from "morgan"
import { IncomingMessage } from "http"
import { Pool } from "pg"
import { AppOptions, DbOptions, RabbitOptions } from "./env"
import { v4 as uuid } from "uuid"
import * as homeController from "./controllers/home"
import * as statusController from "./controllers/status"
import * as usersController from "./controllers/users"
import * as heavyStuffController from "./controllers/heavy_stuff"
import runner from "node-pg-migrate"
import { Rabbit } from "./infra/rabbit"
import { LocalCommandBus } from "./infra/local_command_bus"
import { UserCommandHandler } from "./user/user_command_handler"
import { ConfirmationPolicy } from "./user/confirmation_policy"
import { Db } from "./infra/db"
import { UserRepository } from "./user/user_repository"
import { createEventBuilderFor, RabbitServiceBus } from "./infra/rabbit_service_bus"
import { EmailConfirmed } from "./user/user"
import { inspect } from "util"
import multer, { memoryStorage } from "multer"
import { errorHandler } from "./infra/error_handler"
import { validateEmailConfirmedPayload } from "./user/validation"
import { startOutboxPatternMonitor } from "./infra/outbox_pattern"
import { UserView } from "./user/user_view"
import { registerPromMetrics } from "./monitoring"
import { trace } from "@opentelemetry/api"
import { HeavyStuffCommandHandler } from "./heavy_stuff/heavy_stuff"

const storage = memoryStorage()
const upload = multer({ storage: storage })

function configureMorgan(app: Application, logger: Logger) {
  token<IncomingMessage & { id: string }>("id", (req) => req.id)
  const f =
    ':id :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" status: :status content-length: :res[content-length] ":referrer" ":user-agent"'
  app.use(morgan(f, { skip: (_req, res) => res.statusCode >= 400, stream: { write: (m) => logger.info(m) } }))
  app.use(
    morgan(f, {
      skip: (_req, res) => res.statusCode < 400 || res.statusCode >= 500,
      stream: { write: (m) => logger.warn(m) },
    })
  )
  app.use(morgan(f, { skip: (_req, res) => res.statusCode < 500, stream: { write: (m) => logger.error(m) } }))
}

export function configureLogger({ silentLog, logLevel } = { silentLog: false, logLevel: "debug" }) {
  return createLogger({
    silent: silentLog,
    level: logLevel,
    format: format.combine(
      format.colorize(),
      format.timestamp(),
      format.align(),
      format.splat(),
      format.label(),
      format.printf((info) => {
        return `${info.timestamp} ${info.reqId || ""} ${info.domainTrace ? inspect(info.domainTrace) : ""}  ${
          info.level
        }: ${info.message}`
      })
    ),
    transports: [new transports.Console({ stderrLevels: ["error"] })],
  })
}

export async function migrate({ host, user, pwd, db }: DbOptions) {
  try {
    await runner({
      databaseUrl: `postgres://${user}:${pwd}@${host}/${db}`,
      migrationsTable: "pgmigrations",
      dir: "migrations",
      direction: "up",
      count: Infinity,
    })
  } catch (error) {
    console.error("Unable to migrate", error)
    throw error
  }
}

export async function connectToDb({ host, user, pwd, db }: DbOptions, logger: Logger): Promise<{ pool: Pool; db: Db }> {
  try {
    const pool = new Pool({ user: user, database: db, password: pwd, host: host })
    await pool.connect()
    await pool.query("SELECT $1::text as message", ["Hello world!"])
    logger.info("Connection to DB executed!!!")
    return { pool, db: new Db(pool) }
  } catch (error) {
    logger.error("Unable to connect to db", error)
    throw error
  }
}

export async function connectToRabbit(
  { uri, tmpQueue }: RabbitOptions,
  msName: string,
  instanceId: string,
  logger: Logger
) {
  try {
    const rabbit = new Rabbit(uri, msName, `${msName}_${instanceId}`, 50, logger)
    await rabbit.connect({ temporary: tmpQueue })
    return rabbit
  } catch (error) {
    console.error("Unable to connect to rabbit", error)
    throw error
  }
}

async function createApp(options: AppOptions) {
  const msName = "ms-template"
  console.log("Running in ", options.env)
  const app = express()
  const logger = configureLogger(options.logger)
  await migrate(options.dbOptions)
  const { db } = await connectToDb(options.dbOptions, logger)
  const rabbit = await connectToRabbit(options.rabbitOptions, msName, options.instanceId, logger)
  const commandBus = new LocalCommandBus(logger, trace.getTracer(msName))
  const eventBus = new RabbitServiceBus(rabbit, msName, logger)

  const userRepository = new UserRepository(db, eventBus)
  const userView = new UserView(db)
  const userCommandHandler = new UserCommandHandler(userRepository, options.storageServiceUrl)
  userCommandHandler.registerTo(commandBus)

  const heavyStuffCommandHandler = new HeavyStuffCommandHandler(msName)
  heavyStuffCommandHandler.registerTo(commandBus)

  const confirmationPolicy = new ConfirmationPolicy(commandBus)
  confirmationPolicy.registerTo(eventBus)

  app.use((req, _res, next) => {
    const reqId = uuid()
    req.id = reqId
    req.logger = logger.child({ reqId })
    next()
  })
  configureMorgan(app, logger)

  // Express configuration
  app.set("port", options.port)
  app.use(compression())
  app.use(json())
  app.use(urlencoded({ extended: true }))

  app.get("/metrics", registerPromMetrics)

  // Routing
  app.get("/", homeController.index)
  app.get("/healthz", statusController.createHealthz(db, rabbit))
  app.post("/api/error", homeController.error)
  app.get("/api/error", homeController.error)
  app.post("/api/users", usersController.createUser(commandBus))
  app.get("/api/users", usersController.getUsers(userView))
  app.post("/api/users/:id/photo", upload.any(), usersController.uploadPhoto(commandBus))
  app.post("/api/heavy-stuff", heavyStuffController.execute(commandBus))

  app.use(errorHandler(logger))

  await startOutboxPatternMonitor(eventBus, db, logger)

  await eventBus.start(
    [createEventBuilderFor(validateEmailConfirmedPayload, EmailConfirmed)],
    options.rabbitOptions.tmpQueue
  )

  return app
}

export default createApp
