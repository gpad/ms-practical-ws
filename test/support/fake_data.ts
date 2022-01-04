import { internet, name } from "faker"
import { User, UserId } from "../../src/user/user"

export function createUser() {
  return User.create(UserId.new(), {
    firstName: name.firstName(),
    lastName: name.lastName(),
    dateOfBirth: new Date(2006, 6, 6),
    email: internet.email(),
    confirmedAt: null,
  })
}
