import { faker } from "@faker-js/faker"
import { toUserCreatedPayload, User, UserCreatedPayload, UserData, UserId } from "../../src/user/user"

export function createUser() {
  return User.create(UserId.new(), createUserData())
}

export function createUserData(): UserData {
  return {
    firstName: faker.name.firstName(),
    lastName: faker.name.lastName(),
    dateOfBirth: new Date(2006, 6, 6),
    email: faker.internet.email(),
    confirmedAt: null,
  }
}

export function createUserCreatedPayload(): UserCreatedPayload {
  return toUserCreatedPayload(UserId.new(), createUserData())
}
