import { expect } from "chai"
import { configureLogger } from "../../src/app"
import { Command } from "../../src/infra/command"
import { DomainTrace } from "../../src/infra/domain_trace"
import { AggregateId, CommandId, EventId } from "../../src/infra/ids"
import { CommandBus, LocalCommandBus } from "../../src/infra/local_command_bus"
import { expectThrowsAsync } from "../support/expect_util"
import { getTestOptions } from "../support/test_app"

class TestId extends AggregateId<"test_id"> {
  readonly type = "test_id"
}

class TestCommand extends Command {
  static CommandName = "test_command"

  static new() {
    const eventId = EventId.new()
    return new TestCommand(CommandId.new(), TestId.new(), TestCommand.CommandName, DomainTrace.create(eventId))
  }
}

describe("LocalCommandBus", () => {
  const opts = getTestOptions()
  const logger = configureLogger(opts.logger)
  let commandBus: CommandBus

  beforeEach(() => {
    commandBus = new LocalCommandBus(logger)
  })

  it("raise exception if handler is already registered", () => {
    commandBus.register("example_cmd", (cmd) => Promise.resolve({ success: true, payload: cmd }))

    expect(() => {
      commandBus.register("example_cmd", (cmd) => Promise.resolve({ success: true, payload: cmd }))
    }).throw("example_cmd is already registered!")
  })

  // it("return error if command is unknown", async () => {
  //   const cmd = TestCommand.new()
  //   const ret = await commandBus.execute(cmd)
  //   expect(ret).eql({ success: false, errors: [`Command ${inspect(cmd)} is unknown `] })
  // })
  it("raise exception if handler is not registered", async () => {
    const cmd = TestCommand.new()

    await expectThrowsAsync(() => commandBus.execute(cmd), Error, /^Unable to find an handler for TestCommand.*/)
  })

  it("execute handler when command is executed", async () => {
    const testCmd = TestCommand.new()
    const commands: TestCommand[] = []
    commandBus.register(TestCommand.CommandName, (cmd) => {
      commands.push(cmd)
      return Promise.resolve({ success: true, payload: cmd })
    })

    const ret = await commandBus.execute(testCmd)

    expect(ret).eql({ success: true, payload: testCmd })
    expect(commands).lengthOf(1)
    expect(commands).contain(testCmd)
  })
})
