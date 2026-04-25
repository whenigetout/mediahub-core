"use client"

import { HomeFeed, RecommendationsFeed, SearchBar } from "./components"

export const HomePage = () => {
    const handleSearch = (query: string) => {
        console.log("Searching for:", query)

        // later:
        // - call API
        // - update HomeFeed
    }

    return (
        <div>
            <SearchBar
                onSearch={handleSearch}
            />
            <HomeFeed
            />
            <RecommendationsFeed
            />
        </div>
    )
}
