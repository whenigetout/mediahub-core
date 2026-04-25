"use client"

import { VideoCard } from "./VideoCard"
import { mockVideos } from "./mockData"
import { Video } from "./types"

type Props = {
    videos?: Video[]
}

export const HomeFeed = ({ videos }: Props) => {
    const data = videos ?? mockVideos

    return (
        <div style={styles.grid}>
            {data.map((video) => (
                <VideoCard key={video.id} video={video} />
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