import { loadEnvFile } from "./config/env"
import { buildApp } from "./app"

const envState = loadEnvFile()
const app = buildApp()

const port = Number.parseInt(process.env.PORT ?? "4000", 10)

app.listen({ port }, (err) => {
    if (err) {
        app.log.error(err)
        process.exit(1)
    }
    console.log(`Server running on http://localhost:${port}`)
    console.log(
        envState.loaded
            ? `Loaded environment from ${envState.path}`
            : `No .env file found at ${envState.path}; using process environment only.`
    )
})
