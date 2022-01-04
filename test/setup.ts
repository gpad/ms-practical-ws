import { migrate } from "../src/app"
import { getTestOptions } from "./support/test_app"

const { dbOptions } = getTestOptions()

before(() => migrate(dbOptions))
