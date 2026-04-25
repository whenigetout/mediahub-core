import { FastifyInstance } from "fastify"
import { randomUUID } from "crypto"
import {
    EnrichedMetadata,
    LibraryItem,
    LibrarySearchParams,
    LibrarySearchResult,
    ScanCandidate,
} from "./library.types"

type RootFolderRow = {
    path: string
}

type LibraryItemRow = {
    id: string
    video_path: string
    root_path: string
    relative_path: string
    filename: string
    title: string | null
    code: string | null
    studio: string | null
    actresses: string
    tags: string
    plot: string | null
    year: number | null
    runtime_minutes: number | null
    thumbnail_path: string | null
    nfo_path: string | null
    metadata_status: string
    is_available: number
    file_size: number | null
    modified_at: number | null
    last_scanned_at: string
}

const parseJsonArray = (value: string): string[] => {
    try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed)
            ? parsed.filter((item): item is string => typeof item === "string")
            : []
    } catch {
        return []
    }
}

const mapLibraryItem = (row: LibraryItemRow): LibraryItem => ({
    id: row.id,
    videoPath: row.video_path,
    rootPath: row.root_path,
    relativePath: row.relative_path,
    filename: row.filename,
    title: row.title,
    code: row.code,
    studio: row.studio,
    actresses: parseJsonArray(row.actresses),
    tags: parseJsonArray(row.tags),
    plot: row.plot,
    year: row.year,
    runtimeMinutes: row.runtime_minutes,
    thumbnailPath: row.thumbnail_path,
    nfoPath: row.nfo_path,
    metadataStatus: row.metadata_status,
    isAvailable: Boolean(row.is_available),
    fileSize: row.file_size,
    modifiedAt: row.modified_at,
    lastScannedAt: row.last_scanned_at,
})

const joinSearchText = ({
    filename,
    title,
    code,
    studio,
    actresses,
    tags,
    plot,
}: {
    filename: string
    title: string | null
    code: string | null
    studio: string | null
    actresses: string[]
    tags: string[]
    plot: string | null
}) => {
    return [
        filename,
        title,
        code,
        studio,
        actresses.join(" "),
        tags.join(" "),
        plot,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
}

export const getConfiguredRoots = (fastify: FastifyInstance): string[] => {
    const rows = fastify.db
        .prepare(
            `
            SELECT path
            FROM root_folder
            ORDER BY path ASC
            `
        )
        .all() as RootFolderRow[]

    return rows.map((row) => row.path)
}

export const ensureRootFolder = (
    fastify: FastifyInstance,
    rootPath: string
) => {
    fastify.db
        .prepare(
            `
            INSERT INTO root_folder (id, path, label, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(path) DO UPDATE SET
                label = excluded.label,
                status = excluded.status,
                updated_at = CURRENT_TIMESTAMP
            `
        )
        .run(rootPath, rootPath, rootPath, "ready")
}

export const markRootUnavailable = (
    fastify: FastifyInstance,
    rootPath: string
) => {
    fastify.db
        .prepare(
            `
            UPDATE media_file
            SET is_indexed = 0, updated_at = CURRENT_TIMESTAMP
            WHERE path LIKE ?
            `
        )
        .run(`${rootPath}%`)

    fastify.db
        .prepare(
            `
            UPDATE library_item
            SET is_available = 0, updated_at = CURRENT_TIMESTAMP
            WHERE root_path = ?
            `
        )
        .run(rootPath)
}

export const upsertScanCandidate = (
    fastify: FastifyInstance,
    candidate: ScanCandidate
) => {
    const actresses = [
        ...(candidate.parsedNfo?.actresses ?? []),
        ...(candidate.enrichedMetadata?.actresses ?? []),
    ]
    const tags = [
        ...(candidate.parsedNfo?.tags ?? []),
        ...(candidate.enrichedMetadata?.tags ?? []),
    ]

    const uniqueActresses = Array.from(new Set(actresses.filter(Boolean)))
    const uniqueTags = Array.from(new Set(tags.filter(Boolean)))
    const code =
        candidate.parsedNfo?.code ??
        candidate.enrichedMetadata?.code ??
        null
    const title =
        candidate.parsedNfo?.title ??
        candidate.enrichedMetadata?.title ??
        null
    const studio =
        candidate.parsedNfo?.studio ??
        candidate.enrichedMetadata?.studio ??
        null
    const runtimeMinutes =
        candidate.parsedNfo?.runtimeMinutes ??
        candidate.enrichedMetadata?.runtimeMinutes ??
        null
    const year =
        candidate.parsedNfo?.year ??
        candidate.enrichedMetadata?.year ??
        null
    const plot = candidate.parsedNfo?.plot ?? null
    const metadataStatus = title || code ? "partial" : "missing"
    const searchText = joinSearchText({
        filename: candidate.filename,
        title,
        code,
        studio,
        actresses: uniqueActresses,
        tags: uniqueTags,
        plot,
    })

    const existingMediaFile = fastify.db
        .prepare(
            `
            SELECT id
            FROM media_file
            WHERE path = ?
            `
        )
        .get(candidate.videoPath) as { id: string } | undefined

    const mediaFileId = existingMediaFile?.id ?? randomUUID()
    const metadataPayload = JSON.stringify({
        source: "scan",
        title,
        code,
        studio,
        actresses: uniqueActresses,
        tags: uniqueTags,
        plot,
        year,
        runtimeMinutes,
        thumbnailPath: candidate.thumbnailPath,
        nfoPath: candidate.nfoPath,
    })

    fastify.db
        .prepare(
            `
            INSERT INTO media_file (
                id,
                root_folder_id,
                path,
                filename,
                filesize,
                mtime,
                is_indexed,
                metadata_,
                metadata_fetched,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(path) DO UPDATE SET
                root_folder_id = excluded.root_folder_id,
                filename = excluded.filename,
                filesize = excluded.filesize,
                mtime = excluded.mtime,
                is_indexed = 1,
                metadata_ = excluded.metadata_,
                metadata_fetched = excluded.metadata_fetched,
                updated_at = CURRENT_TIMESTAMP
            `
        )
        .run(
            mediaFileId,
            candidate.rootPath,
            candidate.videoPath,
            candidate.filename,
            candidate.fileSize,
            candidate.modifiedAt,
            metadataPayload,
            metadataStatus !== "missing" ? 1 : 0
        )

    fastify.db
        .prepare(
            `
            INSERT INTO library_item (
                id,
                media_file_id,
                root_path,
                relative_path,
                video_path,
                filename,
                title,
                code,
                studio,
                actresses,
                actress_text,
                tags,
                tag_text,
                plot,
                year,
                runtime_minutes,
                thumbnail_path,
                nfo_path,
                metadata_status,
                search_text,
                is_available,
                file_size,
                modified_at,
                last_scanned_at,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(video_path) DO UPDATE SET
                media_file_id = excluded.media_file_id,
                root_path = excluded.root_path,
                relative_path = excluded.relative_path,
                filename = excluded.filename,
                title = excluded.title,
                code = excluded.code,
                studio = excluded.studio,
                actresses = excluded.actresses,
                actress_text = excluded.actress_text,
                tags = excluded.tags,
                tag_text = excluded.tag_text,
                plot = excluded.plot,
                year = excluded.year,
                runtime_minutes = excluded.runtime_minutes,
                thumbnail_path = excluded.thumbnail_path,
                nfo_path = excluded.nfo_path,
                metadata_status = excluded.metadata_status,
                search_text = excluded.search_text,
                is_available = 1,
                file_size = excluded.file_size,
                modified_at = excluded.modified_at,
                last_scanned_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            `
        )
        .run(
            mediaFileId,
            mediaFileId,
            candidate.rootPath,
            candidate.relativePath,
            candidate.videoPath,
            candidate.filename,
            title,
            code,
            studio,
            JSON.stringify(uniqueActresses),
            uniqueActresses.join(" ").toLowerCase(),
            JSON.stringify(uniqueTags),
            uniqueTags.join(" ").toLowerCase(),
            plot,
            year,
            runtimeMinutes,
            candidate.thumbnailPath,
            candidate.nfoPath,
            metadataStatus,
            searchText,
            candidate.fileSize,
            candidate.modifiedAt
        )
}

export const getUnavailableCount = (
    fastify: FastifyInstance,
    roots: string[]
) => {
    if (!roots.length) {
        return 0
    }

    const predicates = roots.map(() => "root_path = ?").join(" OR ")
    const row = fastify.db
        .prepare(
            `
            SELECT COUNT(*) AS count
            FROM library_item
            WHERE is_available = 0
              AND (${predicates})
            `
        )
        .get(...roots) as { count: number }

    return row.count
}

export const searchLibrary = (
    fastify: FastifyInstance,
    params: LibrarySearchParams
): LibrarySearchResult => {
    const limit = Math.min(Math.max(params.limit ?? 24, 1), 100)
    const offset = Math.max(params.offset ?? 0, 0)
    const whereClauses = ["is_available = 1"]
    const values: Array<string | number> = []

    const addLikeFilter = (column: string, value?: string) => {
        if (!value?.trim()) {
            return
        }

        whereClauses.push(`${column} LIKE ?`)
        values.push(`%${value.trim().toLowerCase()}%`)
    }

    const terms = params.q
        ?.trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean) ?? []

    for (const term of terms) {
        whereClauses.push("search_text LIKE ?")
        values.push(`%${term}%`)
    }

    addLikeFilter("actress_text", params.actress)
    addLikeFilter("tag_text", params.tag)
    addLikeFilter("LOWER(COALESCE(studio, ''))", params.studio)
    addLikeFilter("LOWER(COALESCE(code, ''))", params.code)

    if (params.metadataStatus?.trim()) {
        whereClauses.push("metadata_status = ?")
        values.push(params.metadataStatus.trim().toLowerCase())
    }

    const whereSql = whereClauses.length
        ? `WHERE ${whereClauses.join(" AND ")}`
        : ""

    const total = (
        fastify.db
            .prepare(
                `
                SELECT COUNT(*) AS count
                FROM library_item
                ${whereSql}
                `
            )
            .get(...values) as { count: number }
    ).count

    const rows = fastify.db
        .prepare(
            `
            SELECT
                id,
                video_path,
                root_path,
                relative_path,
                filename,
                title,
                code,
                studio,
                actresses,
                tags,
                plot,
                year,
                runtime_minutes,
                thumbnail_path,
                nfo_path,
                metadata_status,
                is_available,
                file_size,
                modified_at,
                last_scanned_at
            FROM library_item
            ${whereSql}
            ORDER BY
                CASE WHEN code IS NULL THEN 1 ELSE 0 END,
                last_scanned_at DESC,
                title COLLATE NOCASE ASC,
                filename COLLATE NOCASE ASC
            LIMIT ?
            OFFSET ?
            `
        )
        .all(...values, limit, offset) as LibraryItemRow[]

    return {
        items: rows.map(mapLibraryItem),
        total,
        limit,
        offset,
    }
}

export const getMetadataByCode = (
    fastify: FastifyInstance,
    code: string
): EnrichedMetadata | null => {
    const normalizedCode = code.trim().toUpperCase()
    if (!normalizedCode) {
        return null
    }

    const baseRow = fastify.db
        .prepare(
            `
            SELECT
                j.code AS code,
                j.title AS title,
                s.name AS studio,
                j.runtime_minutes AS runtime_minutes,
                j.release_year AS year
            FROM jav_metadata j
            LEFT JOIN studio s ON s.id = j.studio_id
            WHERE UPPER(j.code) = ?
            `
        )
        .get(normalizedCode) as
        | {
              code: string
              title: string | null
              studio: string | null
              runtime_minutes: number | null
              year: number | null
          }
        | undefined

    if (!baseRow) {
        return null
    }

    const actressRows = fastify.db
        .prepare(
            `
            SELECT a.name
            FROM video_actress va
            INNER JOIN actress a ON a.id = va.actress_id
            WHERE va.jav_code = ?
            ORDER BY va.billing_order ASC, a.name ASC
            `
        )
        .all(normalizedCode) as Array<{ name: string | null }>

    const tagRows = fastify.db
        .prepare(
            `
            SELECT t.tag_name
            FROM video_tag vt
            INNER JOIN tag t ON t.id = vt.tag_id
            WHERE vt.jav_code = ?
            ORDER BY t.tag_name ASC
            `
        )
        .all(normalizedCode) as Array<{ tag_name: string | null }>

    return {
        code: baseRow.code,
        title: baseRow.title,
        studio: baseRow.studio,
        runtimeMinutes: baseRow.runtime_minutes,
        year: baseRow.year,
        actresses: actressRows
            .map((row) => row.name)
            .filter((value): value is string => Boolean(value)),
        tags: tagRows
            .map((row) => row.tag_name)
            .filter((value): value is string => Boolean(value)),
    }
}
