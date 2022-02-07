import { internet, name } from "faker"
import { toUserCreatedPayload, User, UserCreatedPayload, UserData, UserId } from "../../src/user/user"

export function createUser() {
  return User.create(UserId.new(), createUserData())
}

export function createUserData(): UserData {
  return {
    firstName: name.firstName(),
    lastName: name.lastName(),
    dateOfBirth: new Date(2006, 6, 6),
    email: internet.email(),
    confirmedAt: null,
  }
}

export function createUserCreatedPayload(): UserCreatedPayload {
  return toUserCreatedPayload(UserId.new(), createUserData())
}
