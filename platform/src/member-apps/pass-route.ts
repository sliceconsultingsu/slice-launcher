// The launcher's side of sign-in at a member app: GET /api/app-pass?app=<id>&next=<path>.
// It checks, with current membership, that this signed-in person may open the app, and only then
// sends them to the app's address with a one-time pass. An app's page can send a browser here,
// which is harmless: the pass only ever goes to the address of the app it names, and it works
// only in the browser whose state it was issued against.
import { MembershipError } from "../membership/contracts";
import type { State } from "../membership/contracts";
import { effectivePermissions } from "../membership/domain";
import { sessionIdentity } from "../membership/session";
import { appAddress } from "../platform/address";
import { issuePass } from "./app-sessions";
import { memberAppDescriptor, memberApps } from "./registry";
import { validAppId } from "./rules";

export type PassDeps = {
  db: Pick<D1Database, "prepare" | "batch">;
  loadState: () => Promise<State>;
  /** The launcher's own address. */
  origin: string;
  /** Whether member apps are switched on. */
  enabled: boolean;
};

/** Where in the app to land: a plain path on the app's own address, or its first screen. */
export function safeAppPath(value: string | null): string {
  if (
    !value ||
    value.length > 2000 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/__slice/") ||
    // Backslashes and control characters are read differently by different browsers.
    value.includes("\\") ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return "/";
  return value;
}

const redirect = (location: string) =>
  new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
const notFound = () =>
  new Response("App not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function passRequest(request: Request, deps: PassDeps): Promise<Response> {
  if (!deps.enabled) return notFound();
  if (request.method !== "GET")
    return new Response(null, { status: 405, headers: { Allow: "GET" } });
  const url = new URL(request.url);
  const appId = url.searchParams.get("app") ?? "";
  if (!validAppId(appId)) return notFound();
  const next = safeAppPath(url.searchParams.get("next"));
  let identity;
  try {
    identity = await sessionIdentity(request, deps.db);
  } catch (error) {
    if (!(error instanceof MembershipError) || error.status !== 401) throw error;
    // Sign in, then come back here.
    const back = `/api/app-pass?app=${appId}&next=${encodeURIComponent(next)}`;
    return redirect(`/api/auth/google/start?next=${encodeURIComponent(back)}`);
  }
  const state = await deps.loadState();
  const app = memberApps(state).find((item) => item.id === appId);
  if (!app) return notFound();
  const member = state.members.find((item) => item.subject === identity.subject);
  if (!member || member.email !== identity.email || member.status !== "active")
    return redirect("/account");
  // The app's page in the launcher says why: not shared with them, or not published.
  if (
    app.live === null ||
    !effectivePermissions(state, member, [memberAppDescriptor(app)]).includes(`app.${appId}.open`)
  )
    return redirect(`/about/${appId}`);
  // The pass is tied to the state the app's address gave this browser. A browser that arrives
  // without one (a link straight here, or back from signing in) starts at the app's address.
  const browserState = url.searchParams.get("state") ?? "";
  if (browserState.length !== 43) return redirect(`${appAddress(deps.origin, appId)}${next}`);
  const pass = await issuePass(deps.db, request, appId, browserState);
  if (!pass) return redirect("/account");
  return redirect(
    `${appAddress(deps.origin, appId)}/__slice/session?pass=${pass}&next=${encodeURIComponent(next)}`,
  );
}
