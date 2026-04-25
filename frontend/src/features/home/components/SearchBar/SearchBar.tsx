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
        padding: "12px",
    },
    input: {
        flex: 1,
        padding: "10px 12px",
        fontSize: "14px",
        borderRadius: "6px",
        border: "1px solid #ccc",
        outline: "none",
    },
    button: {
        padding: "10px 16px",
        borderRadius: "6px",
        border: "none",
        backgroundColor: "#111",
        color: "#fff",
        cursor: "pointer",
    },
}