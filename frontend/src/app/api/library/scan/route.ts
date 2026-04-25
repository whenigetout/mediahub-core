import { buildBackendUrl, proxyJson } from "../_shared"

export async function POST(request: Request) {
    const body = await request.text()

    return proxyJson(buildBackendUrl("/api/library/scan"), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body,
    })
}
