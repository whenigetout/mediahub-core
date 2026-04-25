import { buildBackendUrl, proxyJson } from "../_shared"

export async function GET() {
    return proxyJson(buildBackendUrl("/api/library/stats"))
}
