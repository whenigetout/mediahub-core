"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { HomeFeed, SearchBar } from "./components"
import {
    ConfiguredRoot,
    LibraryItem,
    LibraryScanJobStatus,
    LibraryStats,
    LibrarySuggestion,
    NaturalLanguageSearchResponse,
    ScanSummary,
    SearchPreset,
    SearchPresetsResponse,
    SearchResponse,
    SearchSort,
} from "./types"

const backendOrigin =
    process.env.NEXT_PUBLIC_BACKEND_ORIGIN?.replace(/\/$/, "") ?? "http://localhost:4000"

const emptyStats: LibraryStats = {
    totalItems: 0,
    availableItems: 0,
    missingMetadataItems: 0,
}

const idleScanJob: LibraryScanJobStatus = {
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

type FiltersState = {
    actress: string
    studio: string
    code: string
    metadataStatus: string
    yearFrom: string
    yearTo: string
    sort: SearchSort
    pageSize: number
    includeTags: string[]
    excludeTags: string[]
}

const defaultFilters: FiltersState = {
    actress: "",
    studio: "",
    code: "",
    metadataStatus: "",
    yearFrom: "",
    yearTo: "",
    sort: "relevance",
    pageSize: 24,
    includeTags: [],
    excludeTags: [],
}

const getProgressPercent = (scanJob: LibraryScanJobStatus) => {
    if (!scanJob.totalFiles) {
        return 0
    }

    return Math.min(
        100,
        Math.round((scanJob.processedFiles / scanJob.totalFiles) * 100)
    )
}

const uniq = (values: string[]) =>
    Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))

export const HomePage = () => {
    const [query, setQuery] = useState("")
    const [debouncedQuery, setDebouncedQuery] = useState("")
    const [rootsInput, setRootsInput] = useState("")
    const [roots, setRoots] = useState<ConfiguredRoot[]>([])
    const [results, setResults] = useState<LibraryItem[]>([])
    const [selectedVideo, setSelectedVideo] = useState<LibraryItem | null>(null)
    const [stats, setStats] = useState<LibraryStats>(emptyStats)
    const [statusMessage, setStatusMessage] = useState(
        "Ready to scan your local library."
    )
    const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null)
    const [scanJob, setScanJob] = useState<LibraryScanJobStatus>(idleScanJob)
    const [filters, setFilters] = useState<FiltersState>(defaultFilters)
    const [tagInput, setTagInput] = useState("")
    const [excludeTagInput, setExcludeTagInput] = useState("")
    const [page, setPage] = useState(1)
    const [totalResults, setTotalResults] = useState(0)
    const [suggestions, setSuggestions] = useState<LibrarySuggestion[]>([])
    const [presets, setPresets] = useState<SearchPreset[]>([])
    const [presetName, setPresetName] = useState("")
    const [naturalInput, setNaturalInput] = useState("")
    const [naturalMessage, setNaturalMessage] = useState("")
    const [isSearching, startSearchTransition] = useTransition()
    const [isScanning, startScanTransition] = useTransition()
    const [isSavingPreset, startPresetTransition] = useTransition()
    const [isNaturalSearching, startNaturalTransition] = useTransition()

    const parsedRoots = useMemo(
        () =>
            rootsInput
                .split(/\r?\n/)
                .map((root) => root.trim())
                .filter(Boolean),
        [rootsInput]
    )

    const pageCount = Math.max(1, Math.ceil(totalResults / filters.pageSize))

    const currentSearchParams = {
        q: debouncedQuery.trim() || undefined,
        actress: filters.actress.trim() || undefined,
        studio: filters.studio.trim() || undefined,
        code: filters.code.trim() || undefined,
        metadataStatus: filters.metadataStatus.trim() || undefined,
        yearFrom: filters.yearFrom.trim()
            ? Number.parseInt(filters.yearFrom, 10)
            : undefined,
        yearTo: filters.yearTo.trim()
            ? Number.parseInt(filters.yearTo, 10)
            : undefined,
        sort: filters.sort,
        limit: filters.pageSize,
        offset: (page - 1) * filters.pageSize,
        includeTags: filters.includeTags,
        excludeTags: filters.excludeTags,
    }

    const refreshRoots = async () => {
        const response = await fetch("/api/library/roots", { cache: "no-store" })
        const payload = (await response.json()) as { roots: ConfiguredRoot[] }
        setRoots(payload.roots)
        if (!parsedRoots.length && payload.roots.length) {
            setRootsInput(payload.roots.map((root) => root.path).join("\n"))
        }
    }

    const refreshStats = async () => {
        const response = await fetch("/api/library/stats", { cache: "no-store" })
        const payload = (await response.json()) as LibraryStats
        setStats(payload)
    }

    const refreshPresets = async () => {
        const response = await fetch("/api/library/presets", { cache: "no-store" })
        const payload = (await response.json()) as SearchPresetsResponse
        setPresets(payload.presets)
    }

    const refreshScanJob = async () => {
        const response = await fetch("/api/library/scan/current", {
            cache: "no-store",
        })
        const payload = (await response.json()) as LibraryScanJobStatus
        setScanJob(payload)

        if (payload.status === "completed" && payload.summary) {
            setScanSummary(payload.summary)
            setStatusMessage(
                `Scan finished. Indexed ${payload.summary.indexedCount} video files across ${payload.summary.roots.length} roots.`
            )
            await Promise.all([refreshRoots(), refreshStats()])
        }

        if (payload.status === "failed") {
            setStatusMessage(payload.error ?? "Scan failed.")
        }
    }

    const applySearchResponse = (
        payload: SearchResponse,
        nextPage: number,
        nextMessage?: string
    ) => {
        setResults(payload.items)
        setTotalResults(payload.total)
        setPage(nextPage)
        setSelectedVideo((current) => {
            if (current && payload.items.some((item) => item.id === current.id)) {
                return payload.items.find((item) => item.id === current.id) ?? current
            }

            return payload.items[0] ?? null
        })
        setStatusMessage(
            nextMessage ??
                (payload.total
                    ? `Showing page ${nextPage} of ${Math.max(
                          1,
                          Math.ceil(payload.total / payload.limit)
                      )}. ${payload.total} indexed videos matched.`
                    : "No indexed videos matched that search yet.")
        )
    }

    const runSearch = (
        overrides?: Partial<FiltersState> & { query?: string; page?: number }
    ) => {
        const nextQuery = overrides?.query ?? debouncedQuery
        const nextPage = overrides?.page ?? page
        const nextFilters = {
            ...filters,
            ...overrides,
        }

        startSearchTransition(async () => {
            const params = new URLSearchParams()
            if (nextQuery.trim()) {
                params.set("q", nextQuery.trim())
            }

            const scalarEntries: Array<[string, string]> = [
                ["actress", nextFilters.actress],
                ["studio", nextFilters.studio],
                ["code", nextFilters.code],
                ["metadataStatus", nextFilters.metadataStatus],
                ["yearFrom", nextFilters.yearFrom],
                ["yearTo", nextFilters.yearTo],
                ["sort", nextFilters.sort],
            ]

            for (const [key, value] of scalarEntries) {
                if (value.trim()) {
                    params.set(key, value.trim())
                }
            }

            if (nextFilters.includeTags.length) {
                params.set("includeTags", nextFilters.includeTags.join(","))
            }

            if (nextFilters.excludeTags.length) {
                params.set("excludeTags", nextFilters.excludeTags.join(","))
            }

            params.set("limit", String(nextFilters.pageSize))
            params.set("offset", String((nextPage - 1) * nextFilters.pageSize))

            const response = await fetch(`/api/library/search?${params.toString()}`, {
                cache: "no-store",
            })
            const payload = (await response.json()) as SearchResponse

            setFilters(nextFilters)
            applySearchResponse(payload, nextPage)
        })
    }

    const runSuggestions = async (value: string) => {
        if (!value.trim()) {
            setSuggestions([])
            return
        }

        const response = await fetch(
            `/api/library/suggestions?q=${encodeURIComponent(value.trim())}`,
            { cache: "no-store" }
        )
        const payload = (await response.json()) as { suggestions: LibrarySuggestion[] }
        setSuggestions(payload.suggestions)
    }

    const runScan = () => {
        startScanTransition(async () => {
            setStatusMessage("Starting scan...")
            const response = await fetch("/api/library/scan", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    roots: parsedRoots.length ? parsedRoots : undefined,
                }),
            })

            const payload = (await response.json()) as LibraryScanJobStatus
            setScanJob(payload)
            if (!response.ok) {
                setStatusMessage(payload.error ?? "Unable to start scan.")
                return
            }

            setStatusMessage(
                "Scan started. Building a fresh index from your selected roots..."
            )
        })
    }

    const removeRoot = async (rootId: string) => {
        await fetch(`/api/library/roots/${rootId}`, {
            method: "DELETE",
        })
        await refreshRoots()
        await refreshStats()
        setStatusMessage(
            "Removed the root from saved configuration. Indexed items from that root are now marked unavailable."
        )
    }

    const addIncludeTag = (value: string) => {
        const normalized = value.trim()
        if (!normalized) {
            return
        }

        setFilters((current) => ({
            ...current,
            includeTags: uniq([...current.includeTags, normalized]),
            excludeTags: current.excludeTags.filter(
                (tag) => tag.toLowerCase() !== normalized.toLowerCase()
            ),
        }))
        setTagInput("")
    }

    const addExcludeTag = (value: string) => {
        const normalized = value.trim()
        if (!normalized) {
            return
        }

        setFilters((current) => ({
            ...current,
            excludeTags: uniq([...current.excludeTags, normalized]),
            includeTags: current.includeTags.filter(
                (tag) => tag.toLowerCase() !== normalized.toLowerCase()
            ),
        }))
        setExcludeTagInput("")
    }

    const removeChip = (kind: string, value?: string) => {
        setPage(1)
        setNaturalMessage("")
        setFilters((current) => {
            switch (kind) {
                case "query":
                    setQuery("")
                    setDebouncedQuery("")
                    return current
                case "actress":
                    return { ...current, actress: "" }
                case "studio":
                    return { ...current, studio: "" }
                case "code":
                    return { ...current, code: "" }
                case "metadata":
                    return { ...current, metadataStatus: "" }
                case "yearFrom":
                    return { ...current, yearFrom: "" }
                case "yearTo":
                    return { ...current, yearTo: "" }
                case "includeTag":
                    return {
                        ...current,
                        includeTags: current.includeTags.filter((tag) => tag !== value),
                    }
                case "excludeTag":
                    return {
                        ...current,
                        excludeTags: current.excludeTags.filter((tag) => tag !== value),
                    }
                default:
                    return current
            }
        })
    }

    const activeChips = useMemo(() => {
        const chips: Array<{ key: string; label: string; kind: string; value?: string }> = []
        if (debouncedQuery.trim()) {
            chips.push({
                key: `query:${debouncedQuery}`,
                label: `Query: ${debouncedQuery}`,
                kind: "query",
            })
        }
        if (filters.actress.trim()) {
            chips.push({
                key: `actress:${filters.actress}`,
                label: `Actress: ${filters.actress}`,
                kind: "actress",
            })
        }
        if (filters.studio.trim()) {
            chips.push({
                key: `studio:${filters.studio}`,
                label: `Studio: ${filters.studio}`,
                kind: "studio",
            })
        }
        if (filters.code.trim()) {
            chips.push({
                key: `code:${filters.code}`,
                label: `Code: ${filters.code}`,
                kind: "code",
            })
        }
        if (filters.metadataStatus.trim()) {
            chips.push({
                key: `metadata:${filters.metadataStatus}`,
                label: `Metadata: ${filters.metadataStatus}`,
                kind: "metadata",
            })
        }
        if (filters.yearFrom.trim()) {
            chips.push({
                key: `yearFrom:${filters.yearFrom}`,
                label: `Year >= ${filters.yearFrom}`,
                kind: "yearFrom",
            })
        }
        if (filters.yearTo.trim()) {
            chips.push({
                key: `yearTo:${filters.yearTo}`,
                label: `Year <= ${filters.yearTo}`,
                kind: "yearTo",
            })
        }
        for (const tag of filters.includeTags) {
            chips.push({
                key: `include:${tag}`,
                label: `Tag: ${tag}`,
                kind: "includeTag",
                value: tag,
            })
        }
        for (const tag of filters.excludeTags) {
            chips.push({
                key: `exclude:${tag}`,
                label: `Without: ${tag}`,
                kind: "excludeTag",
                value: tag,
            })
        }
        return chips
    }, [debouncedQuery, filters])

    const applyParsedSearch = (
        parsed: Partial<{
            q: string
            actress: string
            studio: string
            code: string
            metadataStatus: string
            yearFrom: number
            yearTo: number
            sort: SearchSort
            includeTags: string[]
            excludeTags: string[]
        }>,
        payload?: SearchResponse,
        nextMessage?: string
    ) => {
        const nextFilters: FiltersState = {
            ...defaultFilters,
            ...filters,
            actress: parsed.actress ?? "",
            studio: parsed.studio ?? "",
            code: parsed.code ?? "",
            metadataStatus: parsed.metadataStatus ?? "",
            yearFrom:
                typeof parsed.yearFrom === "number" ? String(parsed.yearFrom) : "",
            yearTo: typeof parsed.yearTo === "number" ? String(parsed.yearTo) : "",
            sort: parsed.sort ?? "relevance",
            pageSize: filters.pageSize,
            includeTags: uniq(parsed.includeTags ?? []),
            excludeTags: uniq(parsed.excludeTags ?? []),
        }

        const nextQuery = parsed.q ?? ""
        setQuery(nextQuery)
        setDebouncedQuery(nextQuery)
        setFilters(nextFilters)
        setPage(1)

        if (payload) {
            applySearchResponse(payload, 1, nextMessage)
        }
    }

    const handleSuggestionSelect = (suggestion: LibrarySuggestion) => {
        setSuggestions([])
        if (suggestion.kind === "tag") {
            addIncludeTag(suggestion.value)
            return
        }

        if (suggestion.kind === "actress") {
            setFilters((current) => ({ ...current, actress: suggestion.value }))
            return
        }

        if (suggestion.kind === "studio") {
            setFilters((current) => ({ ...current, studio: suggestion.value }))
            return
        }

        if (suggestion.kind === "code") {
            setFilters((current) => ({ ...current, code: suggestion.value }))
            return
        }

        setQuery(suggestion.value)
        setDebouncedQuery(suggestion.value)
        void runSearch({ query: suggestion.value, page: 1 })
    }

    const savePreset = () => {
        if (!presetName.trim()) {
            setStatusMessage("Give the preset a name first.")
            return
        }

        startPresetTransition(async () => {
            const response = await fetch("/api/library/presets", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: presetName.trim(),
                    params: {
                        ...currentSearchParams,
                    },
                }),
            })

            if (!response.ok) {
                setStatusMessage("Unable to save the preset.")
                return
            }

            setPresetName("")
            await refreshPresets()
            setStatusMessage("Saved the current search as a preset.")
        })
    }

    const loadPreset = (preset: SearchPreset) => {
        applyParsedSearch(
            {
                q: preset.params.q,
                actress: preset.params.actress,
                studio: preset.params.studio,
                code: preset.params.code,
                metadataStatus: preset.params.metadataStatus,
                yearFrom: preset.params.yearFrom,
                yearTo: preset.params.yearTo,
                sort: preset.params.sort,
                includeTags: preset.params.includeTags ?? [],
                excludeTags: preset.params.excludeTags ?? [],
            },
            undefined,
            `Loaded preset "${preset.name}".`
        )
    }

    const deletePreset = async (presetId: string) => {
        await fetch(`/api/library/presets/${presetId}`, {
            method: "DELETE",
        })
        await refreshPresets()
        setStatusMessage("Deleted preset.")
    }

    const runNaturalSearch = () => {
        if (!naturalInput.trim()) {
            setNaturalMessage("Enter a natural-language search first.")
            return
        }

        startNaturalTransition(async () => {
            const response = await fetch("/api/library/natural-search", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    input: naturalInput.trim(),
                }),
            })

            if (!response.ok) {
                setNaturalMessage("Natural-language search failed.")
                return
            }

            const payload =
                (await response.json()) as NaturalLanguageSearchResponse
            applyParsedSearch(
                {
                    q: payload.parsed.q,
                    actress: payload.parsed.actress,
                    studio: payload.parsed.studio,
                    code: payload.parsed.code,
                    metadataStatus: payload.parsed.metadataStatus,
                    yearFrom: payload.parsed.yearFrom,
                    yearTo: payload.parsed.yearTo,
                    sort: payload.parsed.sort,
                    includeTags: payload.parsed.includeTags ?? [],
                    excludeTags: payload.parsed.excludeTags ?? [],
                },
                payload.result,
                payload.warning
                    ? `${payload.interpretation} ${payload.warning}`
                    : payload.interpretation
            )
            setNaturalMessage(
                payload.warning
                    ? `${payload.interpretation} ${payload.warning}`
                    : payload.interpretation
            )
            setSuggestions([])
        })
    }

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedQuery(query)
        }, 250)

        return () => window.clearTimeout(timer)
    }, [query])

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void runSuggestions(query)
        }, 140)

        return () => window.clearTimeout(timer)
    }, [query])

    useEffect(() => {
        void Promise.all([
            refreshRoots(),
            refreshStats(),
            refreshPresets(),
            refreshScanJob(),
        ]).then(() => runSearch({ query: "", page: 1 }))
    }, [])

    useEffect(() => {
        void runSearch({ query: debouncedQuery, page: 1 })
    }, [
        debouncedQuery,
        filters.actress,
        filters.studio,
        filters.code,
        filters.metadataStatus,
        filters.yearFrom,
        filters.yearTo,
        filters.sort,
        filters.pageSize,
        filters.includeTags.join("|"),
        filters.excludeTags.join("|"),
    ])

    useEffect(() => {
        if (scanJob.status !== "queued" && scanJob.status !== "running") {
            return
        }

        const interval = window.setInterval(() => {
            void refreshScanJob()
        }, 700)

        return () => window.clearInterval(interval)
    }, [scanJob.status])

    return (
        <div style={styles.page}>
            <div style={styles.hero}>
                <div>
                    <div style={styles.kicker}>Local Index + Real Files</div>
                    <h1 style={styles.title}>MediaHub Library</h1>
                    <p style={styles.subtitle}>
                        Search with refinements, save filter presets, and optionally ask
                        for results in natural language if you enable a local AI parser.
                    </p>
                </div>

                <div style={styles.statsGrid}>
                    <div style={styles.statCard}>
                        <span style={styles.statLabel}>Indexed</span>
                        <strong style={styles.statValue}>{stats.totalItems}</strong>
                    </div>
                    <div style={styles.statCard}>
                        <span style={styles.statLabel}>Available</span>
                        <strong style={styles.statValue}>{stats.availableItems}</strong>
                    </div>
                    <div style={styles.statCard}>
                        <span style={styles.statLabel}>Missing Metadata</span>
                        <strong style={styles.statValue}>{stats.missingMetadataItems}</strong>
                    </div>
                </div>
            </div>

            <div style={styles.workspace}>
                <section style={styles.sidebar}>
                    <div style={styles.panel}>
                        <h2 style={styles.panelTitle}>Library Roots</h2>
                        <p style={styles.panelText}>
                            Add one folder path per line. Scans update the index without
                            touching your original files.
                        </p>
                        <textarea
                            value={rootsInput}
                            onChange={(event) => setRootsInput(event.target.value)}
                            placeholder={"E:\\Media\\JAV\nF:\\Anime"}
                            style={styles.textarea}
                        />
                        <button
                            type="button"
                            onClick={runScan}
                            disabled={
                                isScanning ||
                                scanJob.status === "running" ||
                                scanJob.status === "queued"
                            }
                            style={styles.primaryButton}
                        >
                            {scanJob.status === "running" || scanJob.status === "queued"
                                ? "Scanning..."
                                : "Scan Library"}
                        </button>

                        {(scanJob.status === "running" ||
                            scanJob.status === "queued") && (
                            <div style={styles.progressWrap}>
                                <div style={styles.progressMeta}>
                                    <span>
                                        {scanJob.processedFiles} /{" "}
                                        {scanJob.totalFiles || "?"} files
                                    </span>
                                    <span>{getProgressPercent(scanJob)}%</span>
                                </div>
                                <div style={styles.progressBarTrack}>
                                    <div
                                        style={{
                                            ...styles.progressBarFill,
                                            width: `${getProgressPercent(scanJob)}%`,
                                        }}
                                    />
                                </div>
                                <div style={styles.progressPath}>
                                    {scanJob.currentPath ?? "Preparing scan..."}
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={styles.panel}>
                        <h2 style={styles.panelTitle}>Ask Naturally</h2>
                        <p style={styles.panelText}>
                            Example: `breastfeeding heavy videos with Mio after 2022 without
                            comedy`
                        </p>
                        <textarea
                            value={naturalInput}
                            onChange={(event) => setNaturalInput(event.target.value)}
                            placeholder="Describe what you're feeling like watching..."
                            style={styles.textareaSmall}
                        />
                        <button
                            type="button"
                            onClick={runNaturalSearch}
                            disabled={isNaturalSearching}
                            style={styles.secondaryWideButton}
                        >
                            {isNaturalSearching ? "Interpreting..." : "Run Natural Search"}
                        </button>
                        {naturalMessage ? (
                            <p style={styles.helperText}>{naturalMessage}</p>
                        ) : (
                            <p style={styles.helperText}>
                                Optional local AI: set `OLLAMA_SEARCH_MODEL` on the backend to
                                enable model-based parsing. Without it, the app falls back to
                                built-in heuristics.
                            </p>
                        )}
                    </div>

                    <div style={styles.panel}>
                        <h2 style={styles.panelTitle}>Refine Search</h2>
                        <div style={styles.filterGrid}>
                            <input
                                value={filters.actress}
                                onChange={(event) =>
                                    setFilters((current) => ({
                                        ...current,
                                        actress: event.target.value,
                                    }))
                                }
                                placeholder="Actress"
                                style={styles.filterInput}
                            />
                            <input
                                value={filters.studio}
                                onChange={(event) =>
                                    setFilters((current) => ({
                                        ...current,
                                        studio: event.target.value,
                                    }))
                                }
                                placeholder="Studio"
                                style={styles.filterInput}
                            />
                            <input
                                value={filters.code}
                                onChange={(event) =>
                                    setFilters((current) => ({
                                        ...current,
                                        code: event.target.value,
                                    }))
                                }
                                placeholder="Code"
                                style={styles.filterInput}
                            />
                            <select
                                value={filters.metadataStatus}
                                onChange={(event) =>
                                    setFilters((current) => ({
                                        ...current,
                                        metadataStatus: event.target.value,
                                    }))
                                }
                                style={styles.filterInput}
                            >
                                <option value="">Any metadata</option>
                                <option value="partial">Partial metadata</option>
                                <option value="missing">Missing metadata</option>
                            </select>
                            <select
                                value={filters.sort}
                                onChange={(event) =>
                                    setFilters((current) => ({
                                        ...current,
                                        sort: event.target.value as SearchSort,
                                    }))
                                }
                                style={styles.filterInput}
                            >
                                <option value="relevance">Sort: Relevance</option>
                                <option value="recent">Sort: Recent scan</option>
                                <option value="title">Sort: Title</option>
                                <option value="year">Sort: Year</option>
                                <option value="runtime">Sort: Runtime</option>
                            </select>
                            <select
                                value={String(filters.pageSize)}
                                onChange={(event) =>
                                    setFilters((current) => ({
                                        ...current,
                                        pageSize: Number.parseInt(event.target.value, 10),
                                    }))
                                }
                                style={styles.filterInput}
                            >
                                <option value="12">12 / page</option>
                                <option value="24">24 / page</option>
                                <option value="48">48 / page</option>
                                <option value="96">96 / page</option>
                            </select>
                            <input
                                value={filters.yearFrom}
                                onChange={(event) =>
                                    setFilters((current) => ({
                                        ...current,
                                        yearFrom: event.target.value,
                                    }))
                                }
                                placeholder="Year from"
                                style={styles.filterInput}
                            />
                            <input
                                value={filters.yearTo}
                                onChange={(event) =>
                                    setFilters((current) => ({
                                        ...current,
                                        yearTo: event.target.value,
                                    }))
                                }
                                placeholder="Year to"
                                style={styles.filterInput}
                            />
                        </div>

                        <div style={styles.tagSection}>
                            <div style={styles.tagRow}>
                                <input
                                    value={tagInput}
                                    onChange={(event) => setTagInput(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.preventDefault()
                                            addIncludeTag(tagInput)
                                        }
                                    }}
                                    placeholder="Add include tag"
                                    style={styles.filterInput}
                                />
                                <button
                                    type="button"
                                    onClick={() => addIncludeTag(tagInput)}
                                    style={styles.smallButton}
                                >
                                    Add
                                </button>
                            </div>
                            <div style={styles.tagRow}>
                                <input
                                    value={excludeTagInput}
                                    onChange={(event) =>
                                        setExcludeTagInput(event.target.value)
                                    }
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.preventDefault()
                                            addExcludeTag(excludeTagInput)
                                        }
                                    }}
                                    placeholder="Add exclude tag"
                                    style={styles.filterInput}
                                />
                                <button
                                    type="button"
                                    onClick={() => addExcludeTag(excludeTagInput)}
                                    style={styles.smallButton}
                                >
                                    Exclude
                                </button>
                            </div>
                        </div>
                    </div>

                    <div style={styles.panel}>
                        <h2 style={styles.panelTitle}>Saved Presets</h2>
                        <div style={styles.presetRow}>
                            <input
                                value={presetName}
                                onChange={(event) => setPresetName(event.target.value)}
                                placeholder="Preset name"
                                style={styles.filterInput}
                            />
                            <button
                                type="button"
                                onClick={savePreset}
                                disabled={isSavingPreset}
                                style={styles.smallButton}
                            >
                                {isSavingPreset ? "Saving..." : "Save"}
                            </button>
                        </div>
                        {presets.length ? (
                            <div style={styles.rootList}>
                                {presets.map((preset) => (
                                    <div key={preset.id} style={styles.rootItem}>
                                        <span style={styles.rootPath}>{preset.name}</span>
                                        <div style={styles.inlineActions}>
                                            <button
                                                type="button"
                                                style={styles.secondarySmallButton}
                                                onClick={() => loadPreset(preset)}
                                            >
                                                Load
                                            </button>
                                            <button
                                                type="button"
                                                style={styles.ghostButton}
                                                onClick={() => void deletePreset(preset.id)}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p style={styles.panelText}>No saved presets yet.</p>
                        )}
                    </div>

                    <div style={styles.panel}>
                        <h2 style={styles.panelTitle}>Saved Roots</h2>
                        {roots.length ? (
                            <div style={styles.rootList}>
                                {roots.map((root) => (
                                    <div key={root.id} style={styles.rootItem}>
                                        <span style={styles.rootPath}>{root.path}</span>
                                        <button
                                            type="button"
                                            style={styles.ghostButton}
                                            onClick={() => void removeRoot(root.id)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p style={styles.panelText}>No saved roots yet.</p>
                        )}
                    </div>

                    {scanSummary ? (
                        <div style={styles.panel}>
                            <h2 style={styles.panelTitle}>Last Scan</h2>
                            <p style={styles.panelText}>
                                Indexed {scanSummary.indexedCount} files. Marked unavailable:{" "}
                                {scanSummary.unavailableCount}.
                            </p>
                            {scanSummary.skippedRoots.map((item) => (
                                <div key={item.root} style={styles.warningBox}>
                                    <strong>{item.root}</strong>
                                    <span>{item.reason}</span>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </section>

                <section style={styles.main}>
                    <div style={styles.panel}>
                        <div style={styles.searchRow}>
                            <SearchBar
                                query={query}
                                onQueryChange={setQuery}
                                onSearch={(value) => {
                                    setQuery(value)
                                    setDebouncedQuery(value)
                                    setSuggestions([])
                                    void runSearch({ query: value, page: 1 })
                                }}
                                suggestions={suggestions}
                                onSuggestionSelect={(value) =>
                                    handleSuggestionSelect(
                                        suggestions.find((suggestion) => suggestion.value === value) ?? {
                                            value,
                                            kind: "title",
                                        }
                                    )
                                }
                                isSearching={isSearching}
                                placeholder="Search title, code, actress, studio, tags..."
                            />
                            <button
                                type="button"
                                style={styles.secondaryButton}
                                onClick={() => runSearch({ query, page: 1 })}
                            >
                                Refresh
                            </button>
                        </div>
                        <p style={styles.statusLine}>
                            {isSearching ? "Searching..." : statusMessage}
                        </p>

                        {activeChips.length ? (
                            <div style={styles.chipWrap}>
                                {activeChips.map((chip) => (
                                    <button
                                        key={chip.key}
                                        type="button"
                                        style={styles.chip}
                                        onClick={() => removeChip(chip.kind, chip.value)}
                                    >
                                        {chip.label} ×
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    <div style={styles.paginationRow}>
                        <button
                            type="button"
                            style={styles.secondaryButton}
                            disabled={page <= 1}
                            onClick={() => runSearch({ page: page - 1 })}
                        >
                            Previous
                        </button>
                        <span style={styles.paginationText}>
                            Page {page} of {pageCount}
                        </span>
                        <button
                            type="button"
                            style={styles.secondaryButton}
                            disabled={page >= pageCount}
                            onClick={() => runSearch({ page: page + 1 })}
                        >
                            Next
                        </button>
                    </div>

                    <div style={styles.contentGrid}>
                        <div style={styles.resultsPanel}>
                            <HomeFeed
                                videos={results}
                                selectedVideoId={selectedVideo?.id ?? null}
                                onSelect={setSelectedVideo}
                            />
                        </div>

                        <aside style={styles.playerPanel}>
                            {selectedVideo ? (
                                <>
                                    <div style={styles.playerFrame}>
                                        <video
                                            key={selectedVideo.id}
                                            controls
                                            preload="metadata"
                                            src={`${backendOrigin}/api/library/items/${selectedVideo.id}/stream`}
                                            style={styles.video}
                                        />
                                    </div>
                                    <div style={styles.playerMeta}>
                                        <h2 style={styles.playerTitle}>
                                            {selectedVideo.title ?? selectedVideo.filename}
                                        </h2>
                                        <div style={styles.metaLine}>
                                            {[selectedVideo.code, selectedVideo.studio, selectedVideo.year]
                                                .filter(Boolean)
                                                .join(" • ") || selectedVideo.relativePath}
                                        </div>
                                        <div style={styles.metaLine}>
                                            {selectedVideo.actresses.join(", ") ||
                                                "No actress metadata yet"}
                                        </div>
                                        {selectedVideo.tags.length ? (
                                            <div style={styles.quickTagWrap}>
                                                {selectedVideo.tags.slice(0, 8).map((tag) => (
                                                    <button
                                                        key={tag}
                                                        type="button"
                                                        style={styles.quickTag}
                                                        onClick={() => addIncludeTag(tag)}
                                                    >
                                                        + {tag}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}
                                        <div style={styles.pathBox}>{selectedVideo.videoPath}</div>
                                        {selectedVideo.plot ? (
                                            <p style={styles.plot}>{selectedVideo.plot}</p>
                                        ) : null}
                                    </div>
                                </>
                            ) : (
                                <div style={styles.emptyPlayer}>
                                    Scan a library and pick a result to preview it here.
                                </div>
                            )}
                        </aside>
                    </div>
                </section>
            </div>
        </div>
    )
}

const styles = {
    page: {
        minHeight: "100vh",
        padding: "32px",
        background:
            "radial-gradient(circle at top left, rgba(14, 165, 233, 0.18), transparent 26%), linear-gradient(180deg, #020617 0%, #0f172a 100%)",
        color: "#e2e8f0",
    },
    hero: {
        display: "flex",
        justifyContent: "space-between",
        gap: "24px",
        marginBottom: "24px",
        flexWrap: "wrap" as const,
    },
    kicker: {
        fontSize: "12px",
        textTransform: "uppercase" as const,
        letterSpacing: "0.2em",
        color: "#7dd3fc",
        marginBottom: "10px",
    },
    title: {
        margin: 0,
        fontSize: "42px",
        lineHeight: 1.1,
    },
    subtitle: {
        maxWidth: "760px",
        color: "#cbd5e1",
        lineHeight: 1.6,
    },
    statsGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(140px, 1fr))",
        gap: "12px",
        minWidth: "360px",
        flex: "1 1 360px",
    },
    statCard: {
        borderRadius: "18px",
        padding: "18px",
        background: "rgba(15, 23, 42, 0.72)",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        display: "flex",
        flexDirection: "column" as const,
        gap: "8px",
    },
    statLabel: {
        fontSize: "12px",
        color: "#94a3b8",
        textTransform: "uppercase" as const,
        letterSpacing: "0.08em",
    },
    statValue: {
        fontSize: "28px",
    },
    workspace: {
        display: "grid",
        gridTemplateColumns: "360px minmax(0, 1fr)",
        gap: "20px",
    },
    sidebar: {
        display: "flex",
        flexDirection: "column" as const,
        gap: "16px",
    },
    main: {
        display: "flex",
        flexDirection: "column" as const,
        gap: "16px",
    },
    panel: {
        background: "rgba(15, 23, 42, 0.68)",
        borderRadius: "22px",
        border: "1px solid rgba(148, 163, 184, 0.16)",
        padding: "20px",
    },
    panelTitle: {
        margin: "0 0 8px",
        fontSize: "18px",
    },
    panelText: {
        margin: "0 0 16px",
        color: "#94a3b8",
        lineHeight: 1.5,
    },
    helperText: {
        margin: "12px 0 0",
        color: "#94a3b8",
        fontSize: "13px",
        lineHeight: 1.5,
    },
    textarea: {
        width: "100%",
        minHeight: "120px",
        resize: "vertical" as const,
        borderRadius: "14px",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        background: "#020617",
        color: "#e2e8f0",
        padding: "14px",
        marginBottom: "12px",
        fontFamily: "var(--font-geist-mono)",
        fontSize: "13px",
    },
    textareaSmall: {
        width: "100%",
        minHeight: "88px",
        resize: "vertical" as const,
        borderRadius: "14px",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        background: "#020617",
        color: "#e2e8f0",
        padding: "14px",
        fontSize: "13px",
    },
    primaryButton: {
        width: "100%",
        border: "none",
        borderRadius: "14px",
        padding: "12px 16px",
        background: "linear-gradient(135deg, #38bdf8, #22c55e)",
        color: "#082f49",
        fontWeight: 700,
        cursor: "pointer",
    },
    secondaryWideButton: {
        width: "100%",
        marginTop: "12px",
        border: "1px solid rgba(56, 189, 248, 0.3)",
        borderRadius: "14px",
        padding: "12px 16px",
        background: "rgba(2, 132, 199, 0.16)",
        color: "#e0f2fe",
        cursor: "pointer",
        fontWeight: 700,
    },
    secondaryButton: {
        border: "1px solid rgba(148, 163, 184, 0.2)",
        borderRadius: "12px",
        padding: "10px 14px",
        background: "rgba(15, 23, 42, 0.85)",
        color: "#e2e8f0",
        cursor: "pointer",
    },
    secondarySmallButton: {
        border: "1px solid rgba(148, 163, 184, 0.2)",
        borderRadius: "999px",
        padding: "8px 12px",
        background: "rgba(15, 23, 42, 0.85)",
        color: "#e2e8f0",
        cursor: "pointer",
    },
    smallButton: {
        border: "none",
        borderRadius: "12px",
        padding: "10px 14px",
        background: "#0ea5e9",
        color: "#082f49",
        cursor: "pointer",
        fontWeight: 700,
        whiteSpace: "nowrap" as const,
    },
    ghostButton: {
        border: "1px solid rgba(248, 113, 113, 0.25)",
        borderRadius: "999px",
        padding: "8px 12px",
        background: "transparent",
        color: "#fca5a5",
        cursor: "pointer",
    },
    rootList: {
        display: "flex",
        flexDirection: "column" as const,
        gap: "12px",
    },
    rootItem: {
        display: "flex",
        flexDirection: "column" as const,
        gap: "10px",
        padding: "12px",
        borderRadius: "14px",
        background: "rgba(2, 6, 23, 0.65)",
    },
    inlineActions: {
        display: "flex",
        gap: "8px",
        flexWrap: "wrap" as const,
    },
    rootPath: {
        fontSize: "13px",
        wordBreak: "break-all" as const,
        color: "#cbd5e1",
    },
    filterGrid: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "10px",
    },
    filterInput: {
        width: "100%",
        padding: "10px 12px",
        borderRadius: "12px",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        background: "#020617",
        color: "#e2e8f0",
    },
    tagSection: {
        display: "flex",
        flexDirection: "column" as const,
        gap: "10px",
        marginTop: "12px",
    },
    tagRow: {
        display: "flex",
        gap: "8px",
    },
    presetRow: {
        display: "flex",
        gap: "8px",
        marginBottom: "12px",
    },
    warningBox: {
        display: "flex",
        flexDirection: "column" as const,
        gap: "6px",
        padding: "12px",
        marginTop: "10px",
        borderRadius: "14px",
        background: "rgba(127, 29, 29, 0.35)",
        color: "#fecaca",
    },
    progressWrap: {
        marginTop: "14px",
        display: "flex",
        flexDirection: "column" as const,
        gap: "8px",
    },
    progressMeta: {
        display: "flex",
        justifyContent: "space-between",
        fontSize: "12px",
        color: "#cbd5e1",
    },
    progressBarTrack: {
        width: "100%",
        height: "10px",
        borderRadius: "999px",
        background: "rgba(30, 41, 59, 0.9)",
        overflow: "hidden",
    },
    progressBarFill: {
        height: "100%",
        borderRadius: "999px",
        background: "linear-gradient(90deg, #38bdf8, #22c55e)",
    },
    progressPath: {
        fontSize: "12px",
        color: "#93c5fd",
        wordBreak: "break-all" as const,
    },
    searchRow: {
        display: "flex",
        gap: "10px",
        alignItems: "center",
    },
    statusLine: {
        margin: "12px 0 0",
        color: "#94a3b8",
    },
    chipWrap: {
        display: "flex",
        flexWrap: "wrap" as const,
        gap: "8px",
        marginTop: "14px",
    },
    chip: {
        border: "1px solid rgba(56, 189, 248, 0.25)",
        borderRadius: "999px",
        padding: "8px 12px",
        background: "rgba(2, 132, 199, 0.16)",
        color: "#e0f2fe",
        cursor: "pointer",
    },
    paginationRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px",
    },
    paginationText: {
        color: "#cbd5e1",
        fontSize: "14px",
    },
    contentGrid: {
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 0.9fr)",
        gap: "16px",
        alignItems: "start",
    },
    resultsPanel: {
        background: "rgba(15, 23, 42, 0.68)",
        borderRadius: "22px",
        border: "1px solid rgba(148, 163, 184, 0.16)",
        padding: "10px",
        minHeight: "520px",
    },
    playerPanel: {
        background: "rgba(15, 23, 42, 0.68)",
        borderRadius: "22px",
        border: "1px solid rgba(148, 163, 184, 0.16)",
        padding: "18px",
        position: "sticky" as const,
        top: "24px",
    },
    playerFrame: {
        borderRadius: "18px",
        overflow: "hidden",
        background: "#000",
    },
    video: {
        width: "100%",
        display: "block",
        aspectRatio: "16 / 9",
        background: "#000",
    },
    playerMeta: {
        marginTop: "14px",
        display: "flex",
        flexDirection: "column" as const,
        gap: "10px",
    },
    playerTitle: {
        margin: 0,
        fontSize: "22px",
        lineHeight: 1.3,
    },
    metaLine: {
        color: "#cbd5e1",
        fontSize: "14px",
    },
    quickTagWrap: {
        display: "flex",
        flexWrap: "wrap" as const,
        gap: "8px",
    },
    quickTag: {
        border: "1px solid rgba(34, 197, 94, 0.25)",
        borderRadius: "999px",
        padding: "6px 10px",
        background: "rgba(34, 197, 94, 0.12)",
        color: "#dcfce7",
        cursor: "pointer",
    },
    pathBox: {
        fontSize: "12px",
        lineHeight: 1.5,
        color: "#93c5fd",
        background: "rgba(2, 6, 23, 0.75)",
        borderRadius: "14px",
        padding: "12px",
        wordBreak: "break-all" as const,
    },
    plot: {
        margin: 0,
        color: "#cbd5e1",
        lineHeight: 1.6,
    },
    emptyPlayer: {
        minHeight: "360px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#94a3b8",
        textAlign: "center" as const,
        lineHeight: 1.6,
    },
}
