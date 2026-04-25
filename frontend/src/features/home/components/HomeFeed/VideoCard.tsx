import { Video } from "./types"

type Props = {
    video: Video
}

export const VideoCard = ({ video }: Props) => {
    return (
        <div style={styles.card}>
            <div style={styles.thumbnailWrapper}>
                <img src={video.thumbnail} alt={video.title} style={styles.thumbnail} />
                <span style={styles.duration}>{video.duration}</span>
            </div>

            <div style={styles.info}>
                <div style={styles.title}>{video.title}</div>
                <div style={styles.meta}>{video.views}</div>
            </div>
        </div>
    )
}

const styles = {
    card: {
        cursor: "pointer",
    },
    thumbnailWrapper: {
        position: "relative" as const,
    },
    thumbnail: {
        width: "100%",
        borderRadius: "8px",
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
        fontSize: "14px",
        fontWeight: 500,
    },
    meta: {
        fontSize: "12px",
        color: "#aaa",
    },
}