import { FastifyInstance } from "fastify"
import { createReadStream, promises as fs } from "fs"
import path from "path"
import {
    fetchCurrentScanJob,
    fetchConfiguredRoots,
    fetchLibraryItem,
    fetchLibrarySearchResults,
    fetchLibrarySuggestions,
    fetchLibraryStats,
    removeConfiguredRoot,
    startLibraryScan,
} from "./library.service"
import { LibrarySearchParams, ScanRequest } from "./library.types"

const getContentType = (filePath: string) => {
    switch (path.extname(filePath).toLowerCase()) {
        case ".jpg":
        case ".jpeg":
            return "image/jpeg"
        case ".png":
            return "image/png"
        case ".webp":
            return "image/webp"
        case ".mp4":
            return "video/mp4"
        case ".mkv":
            return "video/x-matroska"
        case ".webm":
            return "video/webm"
        case ".m4v":
            return "video/x-m4v"
        case ".mov":
            return "video/quicktime"
        default:
            return "application/octet-stream"
    }
}

export async function libraryRoutes(fastify: FastifyInstance) {
    fastify.get("/library/roots", async () => {
        return {
            roots: fetchConfiguredRoots(fastify),
        }
    })

    fastify.delete("/library/roots/:id", async (request, reply) => {
        const { id } = request.params as { id: string }
        removeConfiguredRoot(fastify, id)
        return reply.code(204).send()
    })

    fastify.get("/library/stats", async () => {
        return fetchLibraryStats(fastify)
    })

    fastify.get("/library/scan/current", async () => {
        return fetchCurrentScanJob()
    })

    fastify.get("/library/search", async (request) => {
        const query = request.query as Record<string, string | undefined>

        const params: LibrarySearchParams = {
            q: query.q,
            actress: query.actress,
            tag: query.tag,
            studio: query.studio,
            code: query.code,
            metadataStatus: query.metadataStatus,
            yearFrom: query.yearFrom ? Number.parseInt(query.yearFrom, 10) : undefined,
            yearTo: query.yearTo ? Number.parseInt(query.yearTo, 10) : undefined,
            sort: (query.sort as LibrarySearchParams["sort"]) ?? undefined,
            limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
            offset: query.offset ? Number.parseInt(query.offset, 10) : undefined,
        }

        return fetchLibrarySearchResults(fastify, params)
    })

    fastify.get("/library/suggestions", async (request) => {
        const { q } = request.query as { q?: string }
        return {
            suggestions: fetchLibrarySuggestions(fastify, q ?? ""),
        }
    })

    fastify.post("/library/scan", async (request, reply) => {
        const body = (request.body ?? {}) as ScanRequest
        const scanJob = startLibraryScan(fastify, body.roots)
        return reply.code(202).send(scanJob)
    })

    fastify.get("/library/items/:id", async (request, reply) => {
        const { id } = request.params as { id: string }
        const item = fetchLibraryItem(fastify, id)

        if (!item) {
            return reply.code(404).send({ message: "Library item not found." })
        }

        return item
    })

    fastify.get("/library/items/:id/thumbnail", async (request, reply) => {
        const { id } = request.params as { id: string }
        const item = fetchLibraryItem(fastify, id)

        if (!item?.thumbnailPath) {
            return reply.code(404).send({ message: "Thumbnail not found." })
        }

        try {
            const buffer = await fs.readFile(item.thumbnailPath)
            reply.header("Content-Type", getContentType(item.thumbnailPath))
            reply.header("Cache-Control", "no-store")
            return reply.send(buffer)
        } catch {
            return reply.code(404).send({ message: "Thumbnail not found." })
        }
    })

    fastify.get("/library/items/:id/stream", async (request, reply) => {
        const { id } = request.params as { id: string }
        const item = fetchLibraryItem(fastify, id)

        if (!item?.isAvailable) {
            return reply.code(404).send({ message: "Video file not available." })
        }

        try {
            const stat = await fs.stat(item.videoPath)
            const rangeHeader = request.headers.range
            const contentType = getContentType(item.videoPath)

            if (!rangeHeader) {
                reply.header("Content-Type", contentType)
                reply.header("Content-Length", stat.size.toString())
                reply.header("Accept-Ranges", "bytes")
                return reply.send(createReadStream(item.videoPath))
            }

            const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/)
            if (!rangeMatch) {
                return reply.code(416).send({ message: "Invalid range header." })
            }

            const start = rangeMatch[1] ? Number.parseInt(rangeMatch[1], 10) : 0
            const end = rangeMatch[2]
                ? Number.parseInt(rangeMatch[2], 10)
                : stat.size - 1

            if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
                return reply.code(416).send({ message: "Requested range not satisfiable." })
            }

            reply.code(206)
            reply.header("Content-Type", contentType)
            reply.header("Accept-Ranges", "bytes")
            reply.header("Content-Length", (end - start + 1).toString())
            reply.header("Content-Range", `bytes ${start}-${end}/${stat.size}`)

            return reply.send(createReadStream(item.videoPath, { start, end }))
        } catch {
            return reply.code(404).send({ message: "Video file not found." })
        }
    })
}
