import { FastifyInstance } from "fastify"
import {
    ConfiguredLibraryRoot,
    LibrarySearchParams,
    LibrarySearchResult,
    LibraryScanJobStatus,
    LibraryStats,
    LibrarySuggestion,
    ScanSummary,
} from "./library.types"
import {
    deleteConfiguredRoot,
    getLibraryItemById,
    getLibrarySuggestions,
    getLibraryStats,
    listConfiguredRoots,
    searchLibrary,
} from "./library.repository"
import { scanLibrary } from "./library.scanner"
import { randomUUID } from "crypto"

let currentScanJob: LibraryScanJobStatus = {
    jobId: "idle",
    status: "idle",
    roots: [],
    totalFiles: 0,
    processedFiles: 0,
    currentPath: null,
    startedAt: null,
    finishedAt: null,
    error: null,
    summary: null,
}

export const fetchLibrarySearchResults = (
    fastify: FastifyInstance,
    params: LibrarySearchParams
): LibrarySearchResult => {
    return searchLibrary(fastify, params)
}

export const runLibraryScan = async (
    fastify: FastifyInstance,
    roots?: string[]
): Promise<ScanSummary> => {
    return scanLibrary(fastify, roots)
}

export const startLibraryScan = (
    fastify: FastifyInstance,
    roots?: string[]
): LibraryScanJobStatus => {
    if (currentScanJob.status === "queued" || currentScanJob.status === "running") {
        return currentScanJob
    }

    currentScanJob = {
        jobId: randomUUID(),
        status: "queued",
        roots: roots ?? [],
        totalFiles: 0,
        processedFiles: 0,
        currentPath: null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        error: null,
        summary: null,
    }

    void (async () => {
        currentScanJob = {
            ...currentScanJob,
            status: "running",
        }

        try {
            const summary = await scanLibrary(fastify, roots, (update) => {
                currentScanJob = {
                    ...currentScanJob,
                    totalFiles: update.totalFiles ?? currentScanJob.totalFiles,
                    processedFiles:
                        update.processedFiles ?? currentScanJob.processedFiles,
                    currentPath:
                        update.currentPath === undefined
                            ? currentScanJob.currentPath
                            : update.currentPath,
                }
            })

            currentScanJob = {
                ...currentScanJob,
                status: "completed",
                finishedAt: new Date().toISOString(),
                summary,
                currentPath: null,
            }
        } catch (error) {
            currentScanJob = {
                ...currentScanJob,
                status: "failed",
                finishedAt: new Date().toISOString(),
                error: error instanceof Error ? error.message : "Unknown scan error.",
            }
        }
    })()

    return currentScanJob
}

export const fetchCurrentScanJob = (): LibraryScanJobStatus => {
    return currentScanJob
}

export const fetchConfiguredRoots = (
    fastify: FastifyInstance
): ConfiguredLibraryRoot[] => {
    return listConfiguredRoots(fastify)
}

export const removeConfiguredRoot = (
    fastify: FastifyInstance,
    rootId: string
) => {
    return deleteConfiguredRoot(fastify, rootId)
}

export const fetchLibraryStats = (
    fastify: FastifyInstance
): LibraryStats => {
    return getLibraryStats(fastify)
}

export const fetchLibraryItem = (
    fastify: FastifyInstance,
    itemId: string
) => {
    return getLibraryItemById(fastify, itemId)
}

export const fetchLibrarySuggestions = (
    fastify: FastifyInstance,
    query: string
): LibrarySuggestion[] => {
    return getLibrarySuggestions(fastify, query)
}
