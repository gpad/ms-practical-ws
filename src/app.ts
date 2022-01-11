import compression from "compression"
import express, { Application } from "express"
import { Logger, createLogger, format, transports } from "winston"
import morgan from "morgan"
import { IncomingMessage } from "http"
import { Pool } from "pg"
import { AppOptions, DbOptions, RabbitOptions } from "./env"
import { v4 as uuid } from "uuid"
import * as homeController from "./controllers/home"
import * as statusController from "./controllers/status"
import * as usersController from "./controllers/users"
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
import multer from "multer"
import { errorHandler } from "./infra/error_handler"
const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

function configureMorgan(app: Application, logger: Logger) {
  morgan.token<IncomingMessage & { id: string }>("id", (req) => req.id)
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

export async function connectToRabbit({ uri }: RabbitOptions, msName: string, logger: Logger) {
  try {
    const rabbit = new Rabbit(uri, msName, 50, logger)
    await rabbit.connect()
    return rabbit
  } catch (error) {
    console.error("Unable to connect to rabbit", error)
    throw error
  }
}

async function createApp(options: AppOptions) {
  console.log("Running in ", options.env)
  const app = express()
  const logger = configureLogger(options.logger)
  await migrate(options.dbOptions)
  const { db } = await connectToDb(options.dbOptions, logger)
  const rabbit = await connectToRabbit(options.rabbitOptions, "ms-template", logger)
  const commandBus = new LocalCommandBus(logger)
  const eventBus = new RabbitServiceBus(rabbit, "ms-template", logger)

  const userRepository = new UserRepository(db, eventBus)
  const userCommandHandler = new UserCommandHandler(userRepository, options.storageServiceUrl)
  userCommandHandler.registerTo(commandBus)

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
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // Routing
  app.get("/", homeController.index)
  app.get("/healthz", statusController.createHealthz(db, rabbit))
  app.post("/api/error", homeController.error)
  app.get("/api/error", homeController.error)
  app.post("/api/users", usersController.createUser(commandBus))
  app.post("/api/users/:id/photo", upload.any(), usersController.uploadPhoto(commandBus))

  app.use(errorHandler(logger))

  await eventBus.start([createEventBuilderFor("_", EmailConfirmed)], options.rabbitOptions.tmpQueue)

  return app
}

export default createApp