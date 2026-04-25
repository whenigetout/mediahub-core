import { useSearch } from "./useSearch"

type SearchBarProps = {
    onSearch: (query: string) => void
    placeholder?: string
}

export const SearchBar = ({
    onSearch,
    placeholder = "Search videos...",
}: SearchBarProps) => {
    const { query, handleChange, handleSubmit, handleKeyDown } = useSearch({
        onSearch,
    })

    return (
        <div style={styles.container}>
            <input
                type="text"
                value={query}
                onChange={(e) => handleChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                style={styles.input}
            />
            <button onClick={handleSubmit} style={styles.button}>
                Search
            </button>
        </div>
    )
}

const styles = {
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
}
