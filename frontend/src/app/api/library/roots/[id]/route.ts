import { buildBackendUrl, proxyJson } from "../../_shared"

export async function DELETE(
    _request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params
    return proxyJson(buildBackendUrl(`/api/library/roots/${id}`), {
        method: "DELETE",
    })
}
