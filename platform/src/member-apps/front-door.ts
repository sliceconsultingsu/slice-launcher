// Answers every request to a member app's address, https://<id>.<launcher host>. Nothing an app
// publishes runs here: the launcher signs the person in, checks membership and app access on
// every request, and serves the live version's files itself, with the browser rules it chooses.
import { managesApp } from "../membership/app-access";
import type { State, VersionRecord } from "../membership/contracts";
import { effectivePermissions } from "../membership/domain";
import { appAddress } from "../platform/address";
import { cookie } from "../membership/session";
import { appIdentity, redeemPass, startState, STATE_COOKIE } from "./app-sessions";
import type { AppFiles } from "./files";
import { safeAppPath } from "./pass-route";
import { pathPattern } from "./publish";
import { memberAppDescriptor, memberApps } from "./registry";

export type FrontDoorDeps = {
  db: Pick<D1Database, "prepare" | "batch">;
  loadState: () => Promise<State>;
  version: (appId: string, version: number) => Promise<VersionRecord | null>;
  files: AppFiles;
  /** The launcher's own address. */
  origin: string;
  /**
   * The Worker a version's server code was uploaded as, by name, or null if there is none by
   * that name. Left out while server code is switched off.
   */
  server?: (script: string) => { fetch(request: Request): Promise<Response> } | null;
};

/** The largest body the launcher passes on to an app's server code. */
const MAX_API_BODY_BYTES = 1024 * 1024;

/**
 * What an app's pages may do in the browser: load, call and post only to the app's own address,
 * and never be framed. Inline script and style stay allowed, as on the launcher's own pages; the
 * rule limits where a page can reach, not what the app's own code does on its own page.
 */
export const APP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** The launcher's own answers that set a cookie: the two steps of signing in at an app. */
const allowedCookies = new WeakSet<Response>();

/** The headers every answer from an app's address carries, whatever else it says. */
function guarded(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", APP_POLICY);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  // Nothing at an app's address sets a cookie except the launcher's own sign-in redirects.
  if (!allowedCookies.has(response)) headers.delete("Set-Cookie");
  if (!headers.has("Referrer-Policy")) headers.set("Referrer-Policy", "same-origin");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, { status: response.status, headers });
}
const text = (status: number, body: string, headers: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...headers },
  });
const json = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
function redirect(location: string, status = 302, cookies: string[] = []) {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  for (const value of cookies) headers.append("Set-Cookie", value);
  const response = new Response(null, { status, headers });
  if (cookies.length) allowedCookies.add(response);
  return response;
}

/**
 * A request's body, or null once it is larger than `most`. It stops reading at the limit, so a
 * body that does not say how long it is, or goes on for ever, is never held in full.
 */
export async function readUpTo(request: Request, most: number): Promise<ArrayBuffer | null> {
  if (Number(request.headers.get("Content-Length") ?? 0) > most) return null;
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > most) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const whole = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    whole.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return whole.buffer;
}

/** Whether the browser is opening a page (a link, the address bar), not loading something into one. */
function opening(request: Request): boolean {
  if (request.method !== "GET") return false;
  const mode = request.headers.get("Sec-Fetch-Mode");
  if (mode)
    return (
      mode === "navigate" && (request.headers.get("Sec-Fetch-Dest") ?? "document") === "document"
    );
  return (request.headers.get("Accept") ?? "").includes("text/html");
}

export function createFrontDoor(deps: FrontDoorDeps) {
  // Version records never change once saved, so they can be remembered between requests.
  const records = new Map<string, VersionRecord>();
  const record = async (appId: string, version: number) => {
    const key = `${appId}:${version}`;
    const known = records.get(key);
    if (known) return known;
    const loaded = await deps.version(appId, version);
    if (loaded) {
      if (records.size >= 500) records.clear();
      records.set(key, loaded);
    }
    return loaded;
  };

  async function answer(request: Request, appId: string): Promise<Response> {
    const url = new URL(request.url);
    const own = appAddress(deps.origin, appId);
    const reading = request.method === "GET" || request.method === "HEAD";

    // Another app's page, or another site's, may link here. It may not load, call or frame
    // anything here: every app shares the launcher's site, so the browser would send this
    // person's session along.
    const site = request.headers.get("Sec-Fetch-Site");
    if (site && site !== "same-origin" && site !== "none" && !opening(request))
      return text(403, "Forbidden");
    // A change is accepted only from the app's own pages.
    if (!reading && request.headers.get("Origin") !== own) return text(403, "Forbidden");

    if (url.pathname === "/__slice/session") {
      if (request.method !== "GET") return text(405, "Method not allowed", { Allow: "GET" });
      const next = safeAppPath(url.searchParams.get("next"));
      const setCookie = await redeemPass(
        deps.db,
        appId,
        url.searchParams.get("pass") ?? "",
        request,
      );
      // The state has done its job.
      if (setCookie) return redirect(next, 303, [setCookie, cookie(STATE_COOKIE, "", 0)]);
      // A pass that does not work here: carry on only if this browser is already signed in at
      // the app (a second tab), otherwise explain on the app's page in the launcher.
      return (await appIdentity(deps.db, appId, request))
        ? redirect(next, 303)
        : redirect(`${deps.origin}/about/${appId}`);
    }

    // Who is signed in comes first, so a browser that is not signed in learns nothing, not even
    // whether this app exists.
    const identity = await appIdentity(deps.db, appId, request);
    if (!identity) {
      if (!opening(request)) return json(401, { error: "Sign in to Slice." });
      // Start signing in: a state only this browser holds, which the launcher's pass must match.
      const { state, setCookie } = startState();
      const next = encodeURIComponent(url.pathname + url.search);
      return redirect(`${deps.origin}/api/app-pass?app=${appId}&next=${next}&state=${state}`, 302, [
        setCookie,
      ]);
    }

    // Current membership and app access, on every request.
    const state = await deps.loadState();
    const app = memberApps(state).find((item) => item.id === appId);
    if (!app) return text(404, "Not found");
    const member = state.members.find((item) => item.subject === identity.subject);
    if (!member || member.email !== identity.email || member.status !== "active")
      return opening(request)
        ? redirect(`${deps.origin}/account`)
        : json(403, { error: "An active Slice membership is required." });
    const permissions = effectivePermissions(state, member, [memberAppDescriptor(app)]);
    if (app.live === null || !permissions.includes(`app.${appId}.open`))
      return opening(request)
        ? redirect(`${deps.origin}/about/${appId}`)
        : json(403, { error: "You do not have access to this app." });

    if (url.pathname === "/__slice/me") {
      const prefix = `app.${appId}.`;
      return json(200, {
        id: member.id,
        name: member.name,
        manager: managesApp(state, member, appId),
        powers: permissions
          .filter((p) => p.startsWith(prefix) && p !== `${prefix}open`)
          .map((p) => p.slice(prefix.length)),
      });
    }
    if (url.pathname.startsWith("/__slice/")) return text(404, "Not found");
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      // The live version's own Worker, if that version was published with server code.
      const version = await record(appId, app.live);
      if (!version?.server) return json(404, { error: "This app has no server code." });
      const worker = deps.server?.(version.server.script) ?? null;
      if (!worker) return json(503, { error: "This app's server code is switched off." });
      // What the app's code is told comes from the launcher, never from the browser: no cookie,
      // no credentials, and none of the identity headers as the browser sent them.
      const headers = new Headers(request.headers);
      for (const name of [...headers.keys()])
        if (
          name === "cookie" ||
          name === "authorization" ||
          name.startsWith("x-slice-") ||
          name.startsWith("cf-access-")
        )
          headers.delete(name);
      const prefix = `app.${appId}.`;
      headers.set("X-Slice-Member-Id", member.id);
      headers.set("X-Slice-Member-Name", encodeURIComponent(member.name));
      headers.set("X-Slice-Manager", String(managesApp(state, member, appId)));
      headers.set(
        "X-Slice-Powers",
        permissions
          .filter((p) => p.startsWith(prefix) && p !== `${prefix}open`)
          .map((p) => p.slice(prefix.length))
          .join(","),
      );
      let body: ArrayBuffer | undefined;
      if (!reading) {
        const read = await readUpTo(request, MAX_API_BODY_BYTES);
        if (read === null) return json(413, { error: "That is too much to send in one request." });
        body = read;
      }
      try {
        const answered = await worker.fetch(
          new Request(request.url, { method: request.method, headers, body, redirect: "manual" }),
        );
        return new Response(answered.body, { status: answered.status, headers: answered.headers });
      } catch {
        // What went wrong inside the app's code is the app's; it is not passed on.
        return json(502, { error: "This app's server code failed." });
      }
    }

    if (!reading) return text(405, "Method not allowed", { Allow: "GET, HEAD" });
    let path: string;
    try {
      path = decodeURIComponent(url.pathname).slice(1);
    } catch {
      return text(404, "Not found");
    }
    if (path === "" || path.endsWith("/")) path += "index.html";
    if (!pathPattern.test(path)) return text(404, "Not found");
    // Only what the live version's saved record lists is served, from that publish's own files.
    const live = await record(appId, app.live);
    const listed = live?.files.find((file) => file.path === path);
    const stored = live && listed ? await deps.files.get(appId, live.store, path) : null;
    if (!listed || !stored) return text(404, "Not found");
    return new Response(request.method === "HEAD" ? null : stored.body, {
      status: 200,
      headers: {
        "Content-Type": listed.type,
        "Content-Length": String(stored.body.byteLength),
        "Cache-Control": "private, no-cache",
      },
    });
  }

  return async (request: Request, appId: string): Promise<Response> =>
    guarded(await answer(request, appId));
}
