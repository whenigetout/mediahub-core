import { FastifyInstance } from "fastify"
import { promises as fs } from "fs"
import path from "path"
import {
    EnrichedMetadata,
    ParsedNfo,
    ScanCandidate,
    ScanSummary,
} from "./library.types"
import {
    ensureRootFolder,
    getConfiguredRoots,
    getMetadataByCode,
    getUnavailableCount,
    markRootUnavailable,
    upsertScanCandidate,
} from "./library.repository"

const VIDEO_EXTENSIONS = new Set([
    ".mp4",
    ".mkv",
    ".avi",
    ".wmv",
    ".mov",
    ".m4v",
    ".ts",
    ".webm",
])

const THUMBNAIL_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"]

const cleanText = (value: string | null) => value?.trim() || null

const getSingleTagValue = (xml: string, tagName: string) => {
    const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"))
    return cleanText(match?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1") ?? null)
}

const getAllTagValues = (xml: string, tagName: string) => {
    const matches = xml.matchAll(
        new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "gi")
    )

    return Array.from(matches)
        .map((match) =>
            cleanText(match[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1") ?? null)
        )
        .filter((value): value is string => Boolean(value))
}

const getActorNames = (xml: string) => {
    const actorBlocks = xml.matchAll(/<actor>([\s\S]*?)<\/actor>/gi)
    const names: string[] = []

    for (const block of actorBlocks) {
        const name = getSingleTagValue(block[1], "name")
        if (name) {
            names.push(name)
        }
    }

    return names
}

const parseRuntime = (value: string | null) => {
    if (!value) {
        return null
    }

    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : null
}

const parseYear = (value: string | null) => {
    if (!value) {
        return null
    }

    const parsed = Number.parseInt(value.slice(0, 4), 10)
    return Number.isFinite(parsed) ? parsed : null
}

const detectCode = (input: string) => {
    const match = input.toUpperCase().match(/\b([A-Z]{2,10}-?\d{2,5})\b/)
    return match?.[1]?.replace(/([A-Z]+)(\d+)/, "$1-$2") ?? null
}

const parseNfoFile = async (nfoPath: string): Promise<ParsedNfo | null> => {
    try {
        const xml = await fs.readFile(nfoPath, "utf-8")
        const title =
            getSingleTagValue(xml, "title") ??
            getSingleTagValue(xml, "originaltitle")
        const plot = getSingleTagValue(xml, "plot")
        const year =
            parseYear(getSingleTagValue(xml, "year")) ??
            parseYear(getSingleTagValue(xml, "premiered"))
        const runtimeMinutes = parseRuntime(getSingleTagValue(xml, "runtime"))
        const studio = getSingleTagValue(xml, "studio")
        const tags = Array.from(
            new Set([
                ...getAllTagValues(xml, "tag"),
                ...getAllTagValues(xml, "genre"),
            ])
        )
        const actresses = Array.from(new Set(getActorNames(xml)))
        const code =
            getSingleTagValue(xml, "code") ??
            detectCode(title ?? "") ??
            detectCode(path.basename(nfoPath, path.extname(nfoPath)))

        return {
            title,
            plot,
            year,
            runtimeMinutes,
            studio,
            code,
            actresses,
            tags,
        }
    } catch {
        return null
    }
}

const getSiblingPath = async (
    folderPath: string,
    fileBaseName: string,
    extensions: string[]
) => {
    for (const extension of extensions) {
        const candidate = path.join(folderPath, `${fileBaseName}${extension}`)
        try {
            await fs.access(candidate)
            return candidate
        } catch {
            continue
        }
    }

    return null
}

const getFallbackThumbnail = async (folderPath: string) => {
    const preferredNames = ["thumb", "poster", "folder", "cover", "landscape"]

    for (const name of preferredNames) {
        const candidate = await getSiblingPath(folderPath, name, THUMBNAIL_EXTENSIONS)
        if (candidate) {
            return candidate
        }
    }

    try {
        const entries = await fs.readdir(folderPath, { withFileTypes: true })
        const imageEntry = entries.find((entry) => {
            if (!entry.isFile()) {
                return false
            }

            return THUMBNAIL_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())
        })

        return imageEntry ? path.join(folderPath, imageEntry.name) : null
    } catch {
        return null
    }
}

const buildCandidate = async (
    rootPath: string,
    videoPath: string,
    stat: { size: number; mtimeMs: number }
): Promise<ScanCandidate> => {
    const folderPath = path.dirname(videoPath)
    const filename = path.basename(videoPath)
    const baseName = path.basename(videoPath, path.extname(videoPath))
    const relativePath = path.relative(rootPath, videoPath)
    const nfoPath = await getSiblingPath(folderPath, baseName, [".nfo"])
    const thumbnailPath =
        (await getSiblingPath(folderPath, baseName, THUMBNAIL_EXTENSIONS)) ??
        (await getFallbackThumbnail(folderPath))
    const parsedNfo = nfoPath ? await parseNfoFile(nfoPath) : null
    const detectedCode =
        parsedNfo?.code ??
        detectCode(baseName) ??
        detectCode(path.basename(folderPath))

    return {
        rootPath,
        relativePath,
        videoPath,
        filename,
        nfoPath,
        thumbnailPath,
        fileSize: stat.size,
        modifiedAt: Math.trunc(stat.mtimeMs),
        parsedNfo: parsedNfo
            ? {
                  ...parsedNfo,
                  code: detectedCode,
              }
            : null,
        enrichedMetadata: detectedCode
            ? ({ code: detectedCode } as EnrichedMetadata)
            : null,
    }
}

const walkRoot = async (
    fastify: FastifyInstance,
    rootPath: string
): Promise<number> => {
    let indexedCount = 0
    const queue = [rootPath]

    while (queue.length) {
        const currentPath = queue.shift()
        if (!currentPath) {
            continue
        }

        let entries: import("fs").Dirent<string>[] = []
        try {
            entries = await fs.readdir(currentPath, {
                withFileTypes: true,
                encoding: "utf8",
            })
        } catch {
            continue
        }

        for (const entry of entries) {
            const absolutePath = path.join(currentPath, entry.name)

            if (entry.isDirectory()) {
                queue.push(absolutePath)
                continue
            }

            if (!entry.isFile()) {
                continue
            }

            if (!VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
                continue
            }

            const stat = await fs.stat(absolutePath)
            const candidate = await buildCandidate(rootPath, absolutePath, {
                size: stat.size,
                mtimeMs: stat.mtimeMs,
            })

            const enrichedMetadata = candidate.parsedNfo?.code
                ? getMetadataByCode(fastify, candidate.parsedNfo.code)
                : candidate.enrichedMetadata?.code
                  ? getMetadataByCode(fastify, candidate.enrichedMetadata.code)
                  : null

            upsertScanCandidate(fastify, {
                ...candidate,
                enrichedMetadata,
            })
            indexedCount += 1
        }
    }

    return indexedCount
}

export const scanLibrary = async (
    fastify: FastifyInstance,
    requestedRoots?: string[]
): Promise<ScanSummary> => {
    const configuredRoots = requestedRoots?.length
        ? requestedRoots
        : getConfiguredRoots(fastify)

    const uniqueRoots = Array.from(
        new Set(
            configuredRoots
                .map((root) => root.trim())
                .filter(Boolean)
        )
    )

    let indexedCount = 0
    const skippedRoots: Array<{ root: string; reason: string }> = []
    const scannedRoots: string[] = []

    for (const rootPath of uniqueRoots) {
        try {
            const stat = await fs.stat(rootPath)
            if (!stat.isDirectory()) {
                skippedRoots.push({
                    root: rootPath,
                    reason: "Path is not a directory.",
                })
                continue
            }
        } catch {
            skippedRoots.push({
                root: rootPath,
                reason: "Directory does not exist or is not accessible.",
            })
            continue
        }

        ensureRootFolder(fastify, rootPath)
        markRootUnavailable(fastify, rootPath)
        indexedCount += await walkRoot(fastify, rootPath)
        scannedRoots.push(rootPath)
    }

    return {
        roots: scannedRoots,
        indexedCount,
        unavailableCount: getUnavailableCount(fastify, scannedRoots),
        skippedRoots,
    }
}
