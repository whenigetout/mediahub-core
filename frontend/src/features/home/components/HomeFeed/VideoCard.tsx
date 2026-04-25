import { Video } from "./types"

type Props = {
    video: Video
    isSelected?: boolean
    onSelect: (video: Video) => void
}

const backendOrigin =
    process.env.NEXT_PUBLIC_BACKEND_ORIGIN?.replace(/\/$/, "") ?? "http://localhost:4000"

const formatRuntime = (runtimeMinutes: number | null) => {
    if (!runtimeMinutes) {
        return "Unknown"
    }

    const hours = Math.floor(runtimeMinutes / 60)
    const minutes = runtimeMinutes % 60

    return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}

export const VideoCard = ({ video, isSelected = false, onSelect }: Props) => {
    const thumbnailUrl = `${backendOrigin}/api/library/items/${video.id}/thumbnail`
    const subtitle = [video.code, video.studio, video.year].filter(Boolean).join(" • ")

    return (
        <button
            type="button"
            style={{
                ...styles.card,
                ...(isSelected ? styles.selectedCard : {}),
            }}
            onClick={() => onSelect(video)}
        >
            <div style={styles.thumbnailWrapper}>
                {video.thumbnailPath ? (
                    <img src={thumbnailUrl} alt={video.title ?? video.filename} style={styles.thumbnail} />
                ) : (
                    <div style={styles.placeholder}>No image</div>
                )}
                <span style={styles.duration}>{formatRuntime(video.runtimeMinutes)}</span>
            </div>

            <div style={styles.info}>
                <div style={styles.title}>{video.title ?? video.filename}</div>
                <div style={styles.meta}>{subtitle || video.relativePath}</div>
                <div style={styles.metaMuted}>
                    {video.actresses.slice(0, 3).join(", ") || "No actress metadata yet"}
                </div>
            </div>
        </button>
    )
}

const styles = {
    card: {
        cursor: "pointer",
        textAlign: "left" as const,
        border: "1px solid rgba(148, 163, 184, 0.24)",
        borderRadius: "18px",
        padding: "10px",
        background: "rgba(15, 23, 42, 0.55)",
        color: "#e2e8f0",
    },
    selectedCard: {
        border: "1px solid rgba(56, 189, 248, 0.8)",
        boxShadow: "0 0 0 1px rgba(56, 189, 248, 0.3)",
    },
    thumbnailWrapper: {
        position: "relative" as const,
    },
    thumbnail: {
        width: "100%",
        height: "180px",
        objectFit: "cover" as const,
        borderRadius: "12px",
    },
    placeholder: {
        width: "100%",
        height: "180px",
        borderRadius: "12px",
        background: "linear-gradient(135deg, #1e293b, #334155)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#94a3b8",
        fontSize: "14px",
    },
    duration: {
        position: "absolute" as const,
        bottom: "6px",
        right: "6px",
        background: "rgba(0,0,0,0.7)",
        color: "#fff",
        padding: "2px 6px",
        fontSize: "12px",
        borderRadius: "4px",
    },
    info: {
        marginTop: "6px",
    },
    title: {
        fontSize: "15px",
        fontWeight: 600,
        lineHeight: 1.4,
    },
    meta: {
        fontSize: "12px",
        color: "#cbd5e1",
        marginTop: "4px",
    },
    metaMuted: {
        fontSize: "12px",
        color: "#94a3b8",
        marginTop: "4px",
    },
}
