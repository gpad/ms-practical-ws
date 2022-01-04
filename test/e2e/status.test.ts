import request from "supertest"
import { Application } from "express"
import { getTestApp } from "../support/test_app"
import { expect } from "chai"

describe("status controller ", async () => {
  let app: Application

  before(async () => {
    app = await getTestApp()
  })

  it("return 200 for /healthz", async () => {
    const res = await request(app).get("/healthz").expect(200)

    expect(res.body.status).eql("ok")
  })

  it("return 200 and db stats", async () => {
    const res = await request(app).get("/healthz").expect(200)

    expect(res.body.status).eql("ok")
    expect(res.body.db.maxConnections).exist
  })

  it("return 200 and db rabbit info", async () => {
    const res = await request(app).get("/healthz").expect(200)

    expect(res.body.status).eql("ok")
    expect(res.body.rabbit.exchanges).not.empty
    // expect(res.body.rabbit.queues).not.empty
    expect(res.body.rabbit.serverProperties).property("product", "RabbitMQ")
  })
})
