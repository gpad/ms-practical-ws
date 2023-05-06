import request from "supertest"
import { Application } from "express"
import { getTestApp } from "../support/test_app"
import { expect } from "chai"
import { elapsedFrom } from "../../src/infra/wait"

describe("Execute heavy stuff", async () => {
  let app: Application

  before(async () => (app = await getTestApp()))

  it("return 200 for /api/heavy-stuff and take time", async () => {
    const timeout = 2000
    const startAt = Date.now()
    const res = await request(app).post(`/api/heavy-stuff?timeout=${timeout}`).send({ a: 42 }).expect(200)
    const elapsed = elapsedFrom(startAt)

    expect(res.body.status).eql("ok")
    expect(elapsed).greaterThanOrEqual(timeout)
  }).timeout(5000)
})
