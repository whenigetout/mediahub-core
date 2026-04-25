import { FastifyInstance } from "fastify"
import {
    LibrarySearchParams,
    NaturalLanguageSearchResponse,
} from "./library.types"
import { searchLibrary } from "./library.repository"

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434/api/generate"

const normalizeText = (value: string) =>
    value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")

const parseCommaList = (value: string) =>
    value
        .split(/[,+]/)
        .map((part) => part.trim())
        .filter(Boolean)

const parseHeuristicQuery = (input: string): LibrarySearchParams => {
    const normalized = normalizeText(input)
    const parsed: LibrarySearchParams = {
        includeTags: [],
        excludeTags: [],
        sort: "relevance",
    }

    const actressMatch = normalized.match(/with actress ([a-z0-9\s.'-]+)/i)
    if (actressMatch) {
        parsed.actress = actressMatch[1].trim()
    }

    const studioMatch = normalized.match(/studio ([a-z0-9\s.'-]+)/i)
    if (studioMatch) {
        parsed.studio = studioMatch[1].trim()
    }

    const codeMatch = normalized.match(/\b([a-z]{2,10}-?\d{2,5})\b/i)
    if (codeMatch) {
        parsed.code = codeMatch[1].toUpperCase().replace(/([A-Z]+)(\d+)/, "$1-$2")
    }

    const yearRangeMatch = normalized.match(/from (\d{4}) to (\d{4})/)
    if (yearRangeMatch) {
        parsed.yearFrom = Number.parseInt(yearRangeMatch[1], 10)
        parsed.yearTo = Number.parseInt(yearRangeMatch[2], 10)
    }

    const afterYearMatch = normalized.match(/after (\d{4})/)
    if (afterYearMatch) {
        parsed.yearFrom = Number.parseInt(afterYearMatch[1], 10)
    }

    const beforeYearMatch = normalized.match(/before (\d{4})/)
    if (beforeYearMatch) {
        parsed.yearTo = Number.parseInt(beforeYearMatch[1], 10)
    }

    const includeTagMatch = normalized.match(/(?:tag|tags|feeling|mood) ([a-z0-9\s,+-]+)/i)
    if (includeTagMatch) {
        parsed.includeTags = parseCommaList(includeTagMatch[1])
    }

    const excludeTagMatch = normalized.match(/without ([a-z0-9\s,+-]+)/i)
    if (excludeTagMatch) {
        parsed.excludeTags = parseCommaList(excludeTagMatch[1])
    }

    const stripped = normalized
        .replace(/with actress [a-z0-9\s.'-]+/i, "")
        .replace(/studio [a-z0-9\s.'-]+/i, "")
        .replace(/from \d{4} to \d{4}/i, "")
        .replace(/after \d{4}/i, "")
        .replace(/before \d{4}/i, "")
        .replace(/without [a-z0-9\s,+-]+/i, "")
        .replace(/(?:tag|tags|feeling|mood) [a-z0-9\s,+-]+/i, "")
        .replace(/\bshow me\b/gi, "")
        .replace(/\bvideos?\b/gi, "")
        .replace(/\bwith this actress\b/gi, "")
        .trim()

    if (stripped) {
        parsed.q = stripped
    }

    return parsed
}

const parseModelJson = (output: string): LibrarySearchParams | null => {
    const start = output.indexOf("{")
    const end = output.lastIndexOf("}")
    if (start === -1 || end === -1 || end <= start) {
        return null
    }

    try {
        const parsed = JSON.parse(output.slice(start, end + 1)) as LibrarySearchParams
        return {
            ...parsed,
            includeTags: Array.isArray(parsed.includeTags) ? parsed.includeTags : [],
            excludeTags: Array.isArray(parsed.excludeTags) ? parsed.excludeTags : [],
            sort: parsed.sort ?? "relevance",
        }
    } catch {
        return null
    }
}

const maybeParseWithOllama = async (
    input: string
): Promise<{
    parsed: LibrarySearchParams | null
    aiUsed: boolean
    warning: string | null
}> => {
    const model = process.env.OLLAMA_SEARCH_MODEL?.trim()
    if (!model) {
        return {
            parsed: null,
            aiUsed: false,
            warning: "Set OLLAMA_SEARCH_MODEL to enable local natural-language parsing.",
        }
    }

    try {
        const response = await fetch(process.env.OLLAMA_SEARCH_URL ?? DEFAULT_OLLAMA_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                stream: false,
                prompt: [
                    "Convert the user's media-search request into JSON.",
                    "Allowed keys: q, actress, studio, code, includeTags, excludeTags, yearFrom, yearTo, metadataStatus, sort.",
                    "Keep it short and deterministic. Prefer includeTags for moods/themes.",
                    "Return JSON only.",
                    `User request: ${input}`,
                ].join("\n"),
            }),
        })

        if (!response.ok) {
            return {
                parsed: null,
                aiUsed: false,
                warning: `Ollama request failed with status ${response.status}.`,
            }
        }

        const payload = (await response.json()) as { response?: string }
        const parsed = parseModelJson(payload.response ?? "")
        if (!parsed) {
            return {
                parsed: null,
                aiUsed: false,
                warning: "Ollama response could not be parsed as search JSON.",
            }
        }

        return {
            parsed,
            aiUsed: true,
            warning: null,
        }
    } catch {
        return {
            parsed: null,
            aiUsed: false,
            warning: "Local AI parser unavailable. Falling back to heuristic parsing.",
        }
    }
}

export const runNaturalLanguageSearch = async (
    fastify: FastifyInstance,
    input: string
): Promise<NaturalLanguageSearchResponse> => {
    const aiAttempt = await maybeParseWithOllama(input)
    const parsed = aiAttempt.parsed ?? parseHeuristicQuery(input)
    const result = searchLibrary(fastify, {
        ...parsed,
        limit: parsed.limit ?? 24,
        offset: parsed.offset ?? 0,
    })

    return {
        parsed,
        aiUsed: aiAttempt.aiUsed,
        interpretation: aiAttempt.aiUsed
            ? "Parsed with the local AI layer."
            : "Parsed with the built-in heuristic fallback.",
        warning: aiAttempt.warning,
        result,
    }
}
