import { FastifyInstance } from "fastify"
import { Video } from "./video.types"

export const getVideos = (fastify: FastifyInstance): Video[] => {
    const rows = fastify.db
        .prepare(`
    SELECT code, title, runtime_minutes
    FROM jav_metadata
    LIMIT 20
    `)
        .all()

    return rows as Video[]
}

export const searchVideos = (
    fastify: FastifyInstance,
    query: string
): Video[] => {
    const rows = fastify.db
        .prepare(`
    SELECT code, title, runtime_minutes
    FROM jav_metadata
    WHERE title LIKE ?
    LIMIT 20
    `)
        .all(`%${query}%`)

    return rows as Video[]
}