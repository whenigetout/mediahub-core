import { buildBackendUrl, proxyJson } from "../_shared"

export async function GET() {
    return proxyJson(buildBackendUrl("/api/library/presets"))
}

export async function POST(request: Request) {
    const body = await request.text()
    return proxyJson(buildBackendUrl("/api/library/presets"), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body,
    })
}
