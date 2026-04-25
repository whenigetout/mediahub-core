import { FastifyInstance } from "fastify"
import {
    ConfiguredLibraryRoot,
    LibrarySearchParams,
    LibrarySearchResult,
    LibraryStats,
    ScanSummary,
} from "./library.types"
import {
    deleteConfiguredRoot,
    getLibraryItemById,
    getLibraryStats,
    listConfiguredRoots,
    searchLibrary,
} from "./library.repository"
import { scanLibrary } from "./library.scanner"

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
