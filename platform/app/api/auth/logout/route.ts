import { env } from "cloudflare:workers";
import { endSession } from "../../../../src/membership/session";

export const dynamic = "force-dynamic";

/**
 * Signs this browser out, or every browser the person is signed in on when the form sends
 * `everywhere`. Same-origin POST only, so another site cannot sign people out.
 */
export async function POST(request: Request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    return new Response(JSON.stringify({ error: "Sign out from Slice." }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    });
  const headers = new Headers({ Location: "/account", "Cache-Control": "private, no-store" });
  headers.append(
    "Set-Cookie",
    await endSession(request, env.MEMBERSHIP_DB, { everywhere: await asksForEverywhere(request) }),
  );
  return new Response(null, { status: 303, headers });
}

async function asksForEverywhere(request: Request) {
  if (!request.headers.get("Content-Type")?.startsWith("application/x-www-form-urlencoded"))
    return false;
  const body = await request.text();
  return body.length <= 1024 && new URLSearchParams(body).get("everywhere") === "1";
}
