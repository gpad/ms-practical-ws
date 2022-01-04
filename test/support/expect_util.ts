import { AssertionError, expect } from "chai"
import { isString } from "lodash"
import { elapsedFrom, wait } from "../../src/infra/wait"

export async function expectThrowsAsync(
  method: Function,
  expectedError: { new (...args: never[]): unknown },
  errorMessage: string | RegExp | null = null
): Promise<void> {
  let error = null
  try {
    await method()
  } catch (err) {
    error = err
  }
  expect(error).instanceOf(expectedError)
  if (errorMessage instanceof RegExp) {
    expect((error as Error).message).match(errorMessage)
  }
  if (isString(errorMessage)) {
    expect((error as Error).message).eql(errorMessage)
  }
}

export async function eventually(fn: Function, timeout = 1500) {
  const start = Date.now()
  while (true) {
    try {
      await fn()
      return
    } catch (error) {
      if (elapsedFrom(start) > timeout) {
        if (error instanceof AssertionError) throw error
        expect.fail(error as string)
      }
      await wait(5)
    }
  }
}
