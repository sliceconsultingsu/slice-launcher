import { disconnect } from "../../../../../src/ai-connections/connections";
import { connectionDeps, identify } from "../../../../../src/ai-connections/runtime";
import { errorResponse } from "../../../../../src/membership/api";
import { MembershipError } from "../../../../../src/membership/contracts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (request.headers.get("Origin") !== new URL(request.url).origin)
      throw new MembershipError(403, "Disconnect apps from your Slice account page.");
    const { id } = await params;
    await disconnect(await identify(request), id, connectionDeps(request));
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
