import Fastify from "fastify"
import dbPlugin from "./plugins/db"
import { registerRoutes } from "./routes"

export const buildApp = () => {
    const app = Fastify({ logger: true })

    app.register(dbPlugin)
    app.register(registerRoutes)

    return app
}