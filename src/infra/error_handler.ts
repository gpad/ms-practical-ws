import { NextFunction, Request, Response } from "express"
import { Logger } from "winston"

export function errorHandler(logger: Logger) {
  return (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error(err)
    res.status(500).send(err.message)
  }
}
