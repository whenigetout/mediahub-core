
import { useState } from "react"

type UseSearchOptions = {
    onSearch: (query: string) => void
}

export const useSearch = ({ onSearch }: UseSearchOptions) => {
    const [query, setQuery] = useState("")

    const handleChange = (value: string) => {
        setQuery(value)
    }

    const handleSubmit = () => {
        const trimmed = query.trim()
        if (!trimmed) return
        onSearch(trimmed)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            handleSubmit()
        }
    }

    return {
        query,
        handleChange,
        handleSubmit,
        handleKeyDown,
    }
}