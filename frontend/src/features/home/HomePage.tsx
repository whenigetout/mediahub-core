"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { HomeFeed, SearchBar } from "./components"
import {
    ConfiguredRoot,
    LibraryItem,
    LibraryStats,
    ScanSummary,
    SearchResponse,
} from "./types"

const backendOrigin =
    process.env.NEXT_PUBLIC_BACKEND_ORIGIN?.replace(/\/$/, "") ?? "http://localhost:4000"

const emptyStats: LibraryStats = {
    totalItems: 0,
    availableItems: 0,
    missingMetadataItems: 0,
}

export const HomePage = () => {
    const [query, setQuery] = useState("")
    const [rootsInput, setRootsInput] = useState("")
    const [roots, setRoots] = useState<ConfiguredRoot[]>([])
    const [results, setResults] = useState<LibraryItem[]>([])
    const [selectedVideo, setSelectedVideo] = useState<LibraryItem | null>(null)
    const [stats, setStats] = useState<LibraryStats>(emptyStats)
    const [statusMessage, setStatusMessage] = useState("Ready to scan your local library.")
    const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null)
    const [isSearching, startSearchTransition] = useTransition()
    const [isScanning, startScanTransition] = useTransition()

    const parsedRoots = useMemo(
        () =>
            rootsInput
                .split(/\r?\n/)
                .map((root) => root.trim())
                .filter(Boolean),
        [rootsInput]
    )

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

    const runSearch = (nextQuery: string) => {
        startSearchTransition(async () => {
            const params = new URLSearchParams()
            if (nextQuery.trim()) {
                params.set("q", nextQuery.trim())
            }

            const response = await fetch(`/api/library/search?${params.toString()}`, {
                cache: "no-store",
            })
            const payload = (await response.json()) as SearchResponse
            setQuery(nextQuery)
            setResults(payload.items)
            setSelectedVideo((current) => {
                if (current && payload.items.some((item) => item.id === current.id)) {
                    return payload.items.find((item) => item.id === current.id) ?? current
                }

                return payload.items[0] ?? null
            })
            setStatusMessage(
                payload.total
                    ? `Showing ${payload.items.length} of ${payload.total} indexed videos.`
                    : "No indexed videos matched that search yet."
            )
        })
    }

    const runScan = () => {
        startScanTransition(async () => {
            setStatusMessage("Scanning library roots and updating the local index...")

            const response = await fetch("/api/library/scan", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    roots: parsedRoots.length ? parsedRoots : undefined,
                }),
            })

            const payload = (await response.json()) as ScanSummary
            setScanSummary(payload)

            if (!response.ok) {
                setStatusMessage("Scan failed. Check the skipped roots list and try again.")
                return
            }

            await Promise.all([refreshRoots(), refreshStats()])
            await runSearch(query)
            setStatusMessage(
                `Scan finished. Indexed ${payload.indexedCount} video files across ${payload.roots.length} roots.`
            )
        })
    }

    const removeRoot = async (rootId: string) => {
        await fetch(`/api/library/roots/${rootId}`, {
            method: "DELETE",
        })
        await refreshRoots()
        await refreshStats()
        setStatusMessage("Removed the root from saved configuration. Indexed items from that root are now marked unavailable.")
    }

    useEffect(() => {
        void Promise.all([refreshRoots(), refreshStats()]).then(() => runSearch(""))
    }, [])

    return (
        <div style={styles.page}>
            <div style={styles.hero}>
                <div>
                    <div style={styles.kicker}>Local Index + Real Files</div>
                    <h1 style={styles.title}>MediaHub Library</h1>
                    <p style={styles.subtitle}>
                        Point the app at your real folders, scan them into the local index,
                        and search the results immediately.
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
                            replacing your original files.
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
                            disabled={isScanning}
                            style={styles.primaryButton}
                        >
                            {isScanning ? "Scanning..." : "Scan Library"}
                        </button>
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
                                Indexed {scanSummary.indexedCount} files. Marked unavailable: {scanSummary.unavailableCount}.
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
                            <SearchBar onSearch={runSearch} placeholder="Search title, code, actress, studio, tags..." />
                            <button
                                type="button"
                                style={styles.secondaryButton}
                                onClick={() => runSearch(query)}
                            >
                                Refresh
                            </button>
                        </div>
                        <p style={styles.statusLine}>
                            {isSearching ? "Searching..." : statusMessage}
                        </p>
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
                                            {selectedVideo.actresses.join(", ") || "No actress metadata yet"}
                                        </div>
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
        gridTemplateColumns: "320px minmax(0, 1fr)",
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
    secondaryButton: {
        border: "1px solid rgba(148, 163, 184, 0.2)",
        borderRadius: "12px",
        padding: "10px 14px",
        background: "rgba(15, 23, 42, 0.85)",
        color: "#e2e8f0",
        cursor: "pointer",
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
    rootPath: {
        fontSize: "13px",
        wordBreak: "break-all" as const,
        color: "#cbd5e1",
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
    searchRow: {
        display: "flex",
        gap: "10px",
        alignItems: "center",
    },
    statusLine: {
        margin: "12px 0 0",
        color: "#94a3b8",
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
