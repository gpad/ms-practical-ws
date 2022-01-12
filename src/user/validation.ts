import Ajv, { JSONSchemaType } from "ajv"
import { EmailConfirmedPayload, UserCreatedPayload } from "./user"
import addFormats from "ajv-formats"

const ajv = new Ajv({ strict: true })
addFormats(ajv)

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
export const validateUserCreatedPayload = ajv.compile<UserCreatedPayload>(UserCreatedPayloadSchema)

const EmailConfirmedPayloadSchema: JSONSchemaType<EmailConfirmedPayload> = {
  type: "object",
  properties: {
    userId: { type: "string", format: "uuid" },
    email: { type: "string", format: "email" },
  },
  required: ["userId", "email"],
  additionalProperties: false,
}
export const validateEmailConfirmedPayload = ajv.compile<EmailConfirmedPayload>(EmailConfirmedPayloadSchema)

// export function validateEmailConfirmedPayload() {}
