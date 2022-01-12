import Ajv, { JSONSchemaType } from "ajv"
import addFormats from "ajv-formats"
import { expect } from "chai"
import { UserCreatedPayload } from "../../src/user/user"
import { createUserCreatedPayload } from "../support/fake_data"
const ajv = new Ajv({ strict: true })
addFormats(ajv) // options can be passed, e.g. {allErrors: true}

const exampleSchema = {
  type: "object",
  properties: {
    foo: { type: "integer" },
    bar: { type: "string" },
  },
  required: ["foo", "bar"],
  additionalProperties: false,
}

const validateExample = ajv.compile(exampleSchema)

const UserCreatedPayloadSchema: JSONSchemaType<UserCreatedPayload> = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    confirmedAt: { type: "string", format: "date-time", nullable: true },
    dateOfBirth: { type: "string", format: "date-time", nullable: true },
    email: { type: "string" },
    firstName: { type: "string" },
    lastName: { type: "string" },
  },
  required: [],
  additionalProperties: false,
}
const validateUserCreatedPayload = ajv.compile<UserCreatedPayload>(UserCreatedPayloadSchema)

/**
 * Ajv documentation https://ajv.js.org/guide/getting-started.html
 */
describe("ajv example", () => {
  it("validate object", () => {
    const data: unknown = {
      foo: 1,
      bar: "abc",
    }

    const valid = validateExample(data)
    if (!valid) console.log(validateExample.errors)
  })

  it("don't validate wrong type", () => {
    const ret = validateUserCreatedPayload({ a: 1 })
    expect(ret).false
  })

  it("validate correct type", () => {
    const data = JSON.parse(JSON.stringify(createUserCreatedPayload()))
    const ret = validateUserCreatedPayload(data)
    if (ret) {
      data.dateOfBirth
    }
    expect(ret).true
  })
})
