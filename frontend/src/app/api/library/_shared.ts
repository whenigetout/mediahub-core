const backendOrigin =
    process.env.BACKEND_API_ORIGIN?.replace(/\/$/, "") ?? "http://localhost:4000"

export const buildBackendUrl = (pathname: string, search?: string) => {
    const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`
    return `${backendOrigin}${normalizedPath}${search ?? ""}`
}

export const proxyJson = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, {
        ...init,
        cache: "no-store",
    })

    const payload = await response.text()

    return new Response(payload, {
        status: response.status,
        headers: {
            "Content-Type": response.headers.get("content-type") ?? "application/json",
        },
    })
}

export { backendOrigin }
