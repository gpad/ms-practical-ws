import request from "supertest"
import { Application } from "express"
import { getTestApp } from "../support/test_app"

describe("GET /", () => {
  let app: Application

  before(async () => {
    app = await getTestApp()
  })

  it("should return 200 OK", async () => {
    await request(app).get("/").expect(200)
  })
})
