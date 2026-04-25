import fs from "fs"
import path from "path"

const stripQuotes = (value: string) => {
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        return value.slice(1, -1)
    }

    return value
}

export const loadEnvFile = (cwd = process.cwd()) => {
    const envPath = path.resolve(cwd, ".env")
    if (!fs.existsSync(envPath)) {
        return {
            path: envPath,
            loaded: false,
        }
    }

    const contents = fs.readFileSync(envPath, "utf-8")
    for (const rawLine of contents.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith("#")) {
            continue
        }

        const separatorIndex = line.indexOf("=")
        if (separatorIndex === -1) {
            continue
        }

        const key = line.slice(0, separatorIndex).trim()
        const value = stripQuotes(line.slice(separatorIndex + 1).trim())

        if (!key || process.env[key] !== undefined) {
            continue
        }

        process.env[key] = value
    }

    return {
        path: envPath,
        loaded: true,
    }
}
