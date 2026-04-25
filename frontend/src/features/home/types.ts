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

export type SearchResponse = {
    items: LibraryItem[]
    total: number
    limit: number
    offset: number
}

export type ConfiguredRoot = {
    id: string
    path: string
}

export type RootsResponse = {
    roots: ConfiguredRoot[]
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

export type LibraryStats = {
    totalItems: number
    availableItems: number
    missingMetadataItems: number
}
