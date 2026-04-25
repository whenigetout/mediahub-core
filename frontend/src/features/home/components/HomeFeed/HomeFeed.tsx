"use client"

import { VideoCard } from "./VideoCard"
import { Video } from "./types"

type Props = {
    videos: Video[]
    selectedVideoId?: string | null
    onSelect: (video: Video) => void
}

export const HomeFeed = ({ videos, selectedVideoId, onSelect }: Props) => {
    return (
        <div style={styles.grid}>
            {videos.map((video) => (
                <VideoCard
                    key={video.id}
                    video={video}
                    isSelected={selectedVideoId === video.id}
                    onSelect={onSelect}
                />
            ))}
        </div>
    )
}

const styles = {
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: "16px",
        padding: "12px",
    },
}
