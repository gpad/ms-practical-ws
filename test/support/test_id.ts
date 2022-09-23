import { AggregateId } from "../../src/infra/ids"

export class TestId extends AggregateId<"test_id"> {
  readonly type = "test_id"
}
