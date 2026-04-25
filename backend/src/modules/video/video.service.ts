import { FastifyInstance } from "fastify"
import { getVideos, searchVideos } from "./video.repository"

export const fetchVideos = (fastify: FastifyInstance) => {
    return getVideos(fastify)
}

export const fetchSearchResults = (
    fastify: FastifyInstance,
    query: string
) => {
    if (!query.trim()) return []
    return searchVideos(fastify, query)
}