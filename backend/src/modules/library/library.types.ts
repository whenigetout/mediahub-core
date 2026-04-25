export type LibrarySearchParams = {
    q?: string
    actress?: string
    tag?: string
    studio?: string
    code?: string
    metadataStatus?: string
    limit?: number
    offset?: number
}

export type LibraryItem = {
    id: string
    videoPath: string
    rootPath: string
    relativePath: string
    filename: string
    title: string | null
    code: string | null
    studio: string | null
    actresses: string[]
    tags: string[]
    plot: string | null
    year: number | null
    runtimeMinutes: number | null
    thumbnailPath: string | null
    nfoPath: string | null
    metadataStatus: string
    isAvailable: boolean
    fileSize: number | null
    modifiedAt: number | null
    lastScannedAt: string
}

export type LibrarySearchResult = {
    items: LibraryItem[]
    total: number
    limit: number
    offset: number
}

export type ScanRequest = {
    roots?: string[]
}

export type ScanSummary = {
    roots: string[]
    indexedCount: number
    unavailableCount: number
    skippedRoots: Array<{
        root: string
        reason: string
    }>
}

export type ConfiguredLibraryRoot = {
    id: string
    path: string
}

export type LibraryStats = {
    totalItems: number
    availableItems: number
    missingMetadataItems: number
}

export type ParsedNfo = {
    title: string | null
    plot: string | null
    year: number | null
    runtimeMinutes: number | null
    studio: string | null
    code: string | null
    actresses: string[]
    tags: string[]
}

export type EnrichedMetadata = {
    code: string | null
    title: string | null
    studio: string | null
    runtimeMinutes: number | null
    year: number | null
    actresses: string[]
    tags: string[]
}

export type ScanCandidate = {
    rootPath: string
    relativePath: string
    videoPath: string
    filename: string
    nfoPath: string | null
    thumbnailPath: string | null
    fileSize: number
    modifiedAt: number
    parsedNfo: ParsedNfo | null
    enrichedMetadata: EnrichedMetadata | null
}
