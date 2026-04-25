import { buildApp } from "./app"

const app = buildApp()

app.listen({ port: 4000 }, (err) => {
    if (err) {
        app.log.error(err)
        process.exit(1)
    }
    console.log("Server running on http://localhost:4000")
})