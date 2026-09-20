import { FastifyInstance } from "fastify"
import {
    AiSearchStatus,
    LibrarySearchParams,
    NaturalLanguageSearchResponse,
} from "./library.types"
import { findMatchingTags, searchLibrary } from "./library.repository"

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
const DEFAULT_OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags"

const normalizeText = (value: string) =>
    value
        .trim()
        .toLowerCase()
        .replace(/[-_/]+/g, " ")
        .replace(/\s+/g, " ")

const parseCommaList = (value: string) =>
    value
        .split(/[,+]/)
        .map((part) => part.trim())
        .filter(Boolean)

const STOP_WORDS = new Set([
    "show",
    "me",
    "all",
    "the",
    "a",
    "an",
    "some",
    "videos",
    "video",
    "scenes",
    "scene",
    "with",
    "without",
    "any",
    "actress",
    "actors",
    "kind",
    "type",
    "probably",
    "that",
    "have",
    "this",
    "those",
    "these",
    "please",
])

const THEME_HINT_WORDS = new Set([
    "nurse",
    "nursing",
    "breastfeed",
    "breastfeeding",
    "breast",
    "clinic",
    "hospital",
    "teacher",
    "school",
    "maid",
    "office",
    "romance",
    "doctor",
    "cosplay",
])

const INTENSITY_HINT_WORDS = new Set([
    "intense",
    "heavy",
    "hardcore",
    "rough",
    "extreme",
    "soft",
    "gentle",
])

const cleanParsedParams = (parsed: LibrarySearchParams): LibrarySearchParams => ({
    ...parsed,
    includeTags: Array.from(
        new Set((parsed.includeTags ?? []).map((value) => value.trim()).filter(Boolean))
    ),
    excludeTags: Array.from(
        new Set((parsed.excludeTags ?? []).map((value) => value.trim()).filter(Boolean))
    ),
    sort: parsed.sort ?? "relevance",
})

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

    const themedMatches = normalized.matchAll(/\b([a-z0-9]+)\s+themed\b/gi)
    for (const match of themedMatches) {
        parsed.includeTags?.push(match[1])
    }

    const stripped = normalized
        .replace(/\bshow\b/gi, "")
        .replace(/with actress [a-z0-9\s.'-]+/i, "")
        .replace(/with any actress/gi, "")
        .replace(/with no actress preference/gi, "")
        .replace(/studio [a-z0-9\s.'-]+/i, "")
        .replace(/from \d{4} to \d{4}/i, "")
        .replace(/after \d{4}/i, "")
        .replace(/before \d{4}/i, "")
        .replace(/without [a-z0-9\s,+-]+/i, "")
        .replace(/(?:tag|tags|feeling|mood) [a-z0-9\s,+-]+/i, "")
        .replace(/\b[a-z0-9]+\s+themed\b/gi, "")
        .replace(/\bshow me\b/gi, "")
        .replace(/\bvideos?\b/gi, "")
        .replace(/\bscenes?\b/gi, "")
        .replace(/\bwith this actress\b/gi, "")
        .trim()

    const strippedTerms = stripped
        .split(/\s+/)
        .map((term) => term.trim())
        .filter(Boolean)

    const qTerms: string[] = []
    for (const term of strippedTerms) {
        if (STOP_WORDS.has(term)) {
            continue
        }

        if (THEME_HINT_WORDS.has(term) || INTENSITY_HINT_WORDS.has(term)) {
            parsed.includeTags?.push(term)
            qTerms.push(term)
            continue
        }

        qTerms.push(term)
    }

    if (qTerms.length) {
        parsed.q = qTerms.join(" ")
    }

    return cleanParsedParams(parsed)
}

const parseModelJson = (output: string): LibrarySearchParams | null => {
    const candidates = [
        output.trim(),
        output.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim(),
    ]

    for (const candidate of candidates) {
        if (!candidate) {
            continue
        }

        try {
            const parsed = JSON.parse(candidate) as LibrarySearchParams
            return cleanParsedParams(parsed)
        } catch {
            const start = candidate.indexOf("{")
            const end = candidate.lastIndexOf("}")
            if (start === -1 || end === -1 || end <= start) {
                continue
            }

            try {
                const parsed = JSON.parse(
                    candidate.slice(start, end + 1)
                ) as LibrarySearchParams
                return cleanParsedParams(parsed)
            } catch {
                continue
            }
        }
    }

    return null
}

const getOllamaTagsUrl = () => {
    const configured = process.env.OLLAMA_SEARCH_URL?.trim()
    if (!configured) {
        return DEFAULT_OLLAMA_TAGS_URL
    }

    try {
        const parsed = new URL(configured)
        parsed.pathname = "/api/tags"
        parsed.search = ""
        return parsed.toString()
    } catch {
        return DEFAULT_OLLAMA_TAGS_URL
    }
}

export const getAiSearchStatus = async (): Promise<AiSearchStatus> => {
    const model = process.env.OLLAMA_SEARCH_MODEL?.trim() ?? null
    const url = process.env.OLLAMA_SEARCH_URL?.trim() ?? DEFAULT_OLLAMA_URL

    if (!model) {
        return {
            provider: "ollama",
            configured: false,
            available: false,
            model: null,
            url,
            message: "AI search is not configured. Set OLLAMA_SEARCH_MODEL in backend/.env.",
        }
    }

    try {
        const response = await fetch(getOllamaTagsUrl(), {
            method: "GET",
        })

        if (!response.ok) {
            return {
                provider: "ollama",
                configured: true,
                available: false,
                model,
                url,
                message: `Ollama server responded with status ${response.status}.`,
            }
        }

        const payload = (await response.json()) as {
            models?: Array<{ name?: string; model?: string }>
        }

        const availableModels = (payload.models ?? [])
            .map((entry) => entry.name ?? entry.model ?? "")
            .filter(Boolean)

        const hasRequestedModel = availableModels.some(
            (entry) => entry === model || entry.startsWith(`${model}:`)
        )

        return {
            provider: "ollama",
            configured: true,
            available: hasRequestedModel,
            model,
            url,
            message: hasRequestedModel
                ? `AI search is available through Ollama with model ${model}.`
                : `Ollama is reachable, but model ${model} is not currently installed.`,
        }
    } catch {
        return {
            provider: "ollama",
            configured: true,
            available: false,
            model,
            url,
            message: "Ollama server could not be reached from the backend.",
        }
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
                format: "json",
                prompt: [
                    "Convert the user's media-search request into strict JSON for a local video search app.",
                    'Allowed keys only: "q", "actress", "studio", "code", "includeTags", "excludeTags", "yearFrom", "yearTo", "metadataStatus", "sort".',
                    'Use arrays for includeTags and excludeTags. If unknown, omit the key or return empty arrays.',
                    'Return a single JSON object only. No markdown. No explanation.',
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
    const heuristicParsed = parseHeuristicQuery(input)
    const parsed = cleanParsedParams(aiAttempt.parsed ?? heuristicParsed)

    let result = searchLibrary(fastify, {
        ...parsed,
        limit: parsed.limit ?? 24,
        offset: parsed.offset ?? 0,
    })

    let finalParsed = parsed

    if (!result.total) {
        const candidateTerms = Array.from(
            new Set([
                ...(parsed.includeTags ?? []),
                ...((parsed.q ?? "")
                    .split(/\s+/)
                    .map((term) => term.trim())
                    .filter(Boolean)),
            ])
        )

        const expandedTags = Array.from(
            new Set(
                candidateTerms.flatMap((term) => [
                    term,
                    ...findMatchingTags(fastify, term),
                ])
            )
        )

        if (expandedTags.length) {
            finalParsed = cleanParsedParams({
                ...parsed,
                includeTags: Array.from(
                    new Set([...(parsed.includeTags ?? []), ...expandedTags])
                ),
            })

            result = searchLibrary(fastify, {
                ...finalParsed,
                limit: finalParsed.limit ?? 24,
                offset: finalParsed.offset ?? 0,
            })
        }
    }

    return {
        parsed: finalParsed,
        aiUsed: aiAttempt.aiUsed,
        interpretation: aiAttempt.aiUsed
            ? "Parsed with the local AI layer."
            : "Parsed with the built-in heuristic fallback.",
        warning: aiAttempt.warning,
        result,
    }
}
