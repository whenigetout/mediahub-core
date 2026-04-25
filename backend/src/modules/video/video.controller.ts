import { FastifyInstance } from "fastify"
import { fetchVideos, fetchSearchResults } from "./video.service"

export async function videoRoutes(fastify: FastifyInstance) {
    fastify.get("/videos", async () => {
        return fetchVideos(fastify)
    })

    fastify.get("/videos/search", async (request) => {
        const { q } = request.query as { q: string }
        return fetchSearchResults(fastify, q)
    })
}