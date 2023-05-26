import createApp from "./app"
import { getAppOptions } from "./env"

async function start() {
  const options = getAppOptions()
  createApp(options)
    .then(async (app) => {
      const port = app.get("port")
      app.listen(port, (error?: Error) => {
        if (error) {
          console.error(error)
          process.exit(1)
        } else {
          console.log("  App is running at http://localhost:%d in %s mode", port, app.get("env"))
          console.log("  Press CTRL-C to stop\n")
        }
      })
    })
    .catch((e) => {
      console.error("Unable to start app", e)
      console.error(e)
      process.exit(1)
    })
}

start().catch((e) => {
  throw e
})
