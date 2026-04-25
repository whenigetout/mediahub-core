import { buildBackendUrl, proxyJson } from "../_shared"

export async function GET(request: Request) {
    const url = new URL(request.url)
    return proxyJson(buildBackendUrl("/api/library/suggestions", url.search))
}
