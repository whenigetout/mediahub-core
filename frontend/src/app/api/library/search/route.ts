import { buildBackendUrl, proxyJson } from "../_shared"

export async function GET(request: Request) {
    const url = new URL(request.url)
    const search = url.search || ""

    return proxyJson(buildBackendUrl("/api/library/search", search))
}
