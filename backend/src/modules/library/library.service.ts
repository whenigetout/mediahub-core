import { FastifyInstance } from "fastify"
import {
    LibrarySearchParams,
    LibrarySearchResult,
    ScanSummary,
} from "./library.types"
import { searchLibrary } from "./library.repository"
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
