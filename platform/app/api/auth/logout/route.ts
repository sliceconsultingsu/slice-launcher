import { env } from "cloudflare:workers";
import { endSession } from "../../../../src/membership/session";

export const dynamic = "force-dynamic";

/** Signs this browser out. Same-origin POST only, so another site cannot sign people out. */
export async function POST(request: Request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    return new Response(JSON.stringify({ error: "Sign out from Slice." }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    });
  const headers = new Headers({ Location: "/account", "Cache-Control": "private, no-store" });
  headers.append("Set-Cookie", await endSession(request, env.MEMBERSHIP_DB));
  return new Response(null, { status: 303, headers });
}
