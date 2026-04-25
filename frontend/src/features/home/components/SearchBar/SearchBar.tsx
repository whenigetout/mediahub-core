import { LibrarySuggestion } from "../../types"

type SearchBarProps = {
    query: string
    onQueryChange: (query: string) => void
    onSearch: (query: string) => void
    suggestions?: LibrarySuggestion[]
    onSuggestionSelect?: (value: string) => void
    isSearching?: boolean
    placeholder?: string
}

export const SearchBar = ({
    query,
    onQueryChange,
    onSearch,
    suggestions = [],
    onSuggestionSelect,
    isSearching = false,
    placeholder = "Search videos...",
}: SearchBarProps) => {
    const handleSubmit = () => {
        onSearch(query)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            handleSubmit()
        }
    }

    return (
        <div style={styles.wrap}>
            <div style={styles.container}>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    style={styles.input}
                />
                <button onClick={handleSubmit} style={styles.button}>
                    {isSearching ? "..." : "Search"}
                </button>
            </div>
            {suggestions.length ? (
                <div style={styles.suggestionList}>
                    {suggestions.map((suggestion) => (
                        <button
                            key={`${suggestion.kind}:${suggestion.value}`}
                            type="button"
                            style={styles.suggestionItem}
                            onClick={() => onSuggestionSelect?.(suggestion.value)}
                        >
                            <span style={styles.suggestionKind}>{suggestion.kind}</span>
                            <span>{suggestion.value}</span>
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    )
}

const styles = {
    wrap: {
        position: "relative" as const,
        width: "100%",
    },
    container: {
        display: "flex",
        gap: "8px",
        width: "100%",
    },
    input: {
        flex: 1,
        padding: "10px 12px",
        fontSize: "14px",
        borderRadius: "12px",
        border: "1px solid rgba(148, 163, 184, 0.25)",
        outline: "none",
        background: "rgba(15, 23, 42, 0.8)",
        color: "#e2e8f0",
    },
    button: {
        padding: "10px 16px",
        borderRadius: "12px",
        border: "none",
        backgroundColor: "#0ea5e9",
        color: "#082f49",
        cursor: "pointer",
        fontWeight: 700,
    },
    suggestionList: {
        position: "absolute" as const,
        top: "calc(100% + 8px)",
        left: 0,
        right: 0,
        borderRadius: "14px",
        border: "1px solid rgba(148, 163, 184, 0.16)",
        background: "rgba(2, 6, 23, 0.96)",
        overflow: "hidden",
        zIndex: 30,
        boxShadow: "0 18px 50px rgba(2, 6, 23, 0.45)",
    },
    suggestionItem: {
        width: "100%",
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        padding: "12px 14px",
        background: "transparent",
        color: "#e2e8f0",
        border: "none",
        borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
        cursor: "pointer",
        textAlign: "left" as const,
    },
    suggestionKind: {
        color: "#7dd3fc",
        textTransform: "uppercase" as const,
        fontSize: "11px",
        letterSpacing: "0.08em",
    },
}
