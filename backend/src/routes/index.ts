import { FastifyInstance } from "fastify"
import { libraryRoutes } from "../modules/library/library.controller"
import { videoRoutes } from "../modules/video/video.controller"

export async function registerRoutes(fastify: FastifyInstance) {
    fastify.register(videoRoutes, { prefix: "/api" })
    fastify.register(libraryRoutes, { prefix: "/api" })
}
