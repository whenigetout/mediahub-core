import { FastifyInstance } from "fastify"
import { fetchLibrarySearchResults, runLibraryScan } from "./library.service"
import { LibrarySearchParams, ScanRequest } from "./library.types"

export async function libraryRoutes(fastify: FastifyInstance) {
    fastify.get("/library/search", async (request) => {
        const query = request.query as Record<string, string | undefined>

        const params: LibrarySearchParams = {
            q: query.q,
            actress: query.actress,
            tag: query.tag,
            studio: query.studio,
            code: query.code,
            metadataStatus: query.metadataStatus,
            limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
            offset: query.offset ? Number.parseInt(query.offset, 10) : undefined,
        }

        return fetchLibrarySearchResults(fastify, params)
    })

    fastify.post("/library/scan", async (request, reply) => {
        const body = (request.body ?? {}) as ScanRequest
        const result = await runLibraryScan(fastify, body.roots)

        if (!result.roots.length && result.skippedRoots.length) {
            return reply.code(400).send(result)
        }

        return result
    })
}
