// Slice's own Google sign-in, modelled on Deal Toy's src/server/google.ts. It proves who the
// person is and starts a session; membership and permissions are still checked on every request.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Identity } from "./contracts";
import { claimsByEmail, migrateLegacyIdentity } from "./domain";
import { Repository } from "./repository";
import { cookie, createSession, readCookie, secret } from "./session";

const AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
/** Subjects for Google identities, kept distinct from the old Cloudflare Access subjects. */
export const GOOGLE_SUBJECT_PREFIX = "https://accounts.google.com|";
const STATE_COOKIE = "__Host-slice_oauth";
let googleKeys: JWTVerifyGetKey | undefined;

export type GoogleEnv = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  LEGACY_ACCESS_ISSUER: string;
  AUTH_LIMITER: RateLimit;
  MEMBERSHIP_DB: D1Database;
};
type Deps = { fetch?: typeof fetch; keys?: JWTVerifyGetKey };
type Failure = "state" | "google" | "unverified" | "email" | "rate" | "unavailable";

function redirect(location: string, cookies: string[]) {
  const headers = new Headers({ Location: location, "Cache-Control": "private, no-store" });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(null, { status: 302, headers });
}
const fail = (code: Failure) =>
  redirect(`/account?sign_in_error=${code}`, [cookie(STATE_COOKIE, "", 0)]);

async function limited(request: Request, env: GoogleEnv) {
  const key = `google:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`;
  return !(await env.AUTH_LIMITER.limit({ key })).success;
}
async function challenge(verifier: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  return btoa(String.fromCharCode(...digest))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
const callbackUrl = (request: Request) => `${new URL(request.url).origin}/api/auth/google/callback`;
const configured = (env: GoogleEnv) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/**
 * Where sign-in may return to besides the account page: only the AI approval page, so the
 * parameter cannot become an open redirect.
 */
export function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith("/authorize?") || value.includes("\\")) return null;
  try {
    return new URL(value, "https://x").origin === "https://x" ? value : null;
  } catch {
    return null;
  }
}
const encodeNext = (next: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(next)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
function decodeNext(segment: string | undefined) {
  if (!segment) return null;
  try {
    const binary = atob(segment.replaceAll("-", "+").replaceAll("_", "/"));
    return safeNext(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

/** Whether Google itself manages this address, so its verification is current. */
function googleManages(email: string, hd: unknown) {
  const domain = email.slice(email.lastIndexOf("@") + 1);
  return domain === "gmail.com" || (typeof hd === "string" && hd.toLowerCase() === domain);
}

/** Sends the browser to Google with PKCE, state and nonce held in a ten-minute cookie. */
export async function googleStart(request: Request, env: GoogleEnv): Promise<Response> {
  if (!configured(env)) return fail("unavailable");
  if (await limited(request, env)) return fail("rate");
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const state = secret();
  const verifier = secret();
  const nonce = secret();
  const url = new URL(AUTHORIZE);
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(request),
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
    nonce,
    code_challenge: await challenge(verifier),
    code_challenge_method: "S256",
  }).toString();
  return redirect(url.toString(), [
    cookie(STATE_COOKIE, `${state}.${verifier}.${nonce}${next ? `.${encodeNext(next)}` : ""}`, 600),
  ]);
}

/**
 * Finishes Google sign-in: checks state, exchanges the code with PKCE, verifies the ID token
 * (signature, issuer, audience, expiry, nonce), requires a verified email, refuses email-based
 * claims on addresses Google does not manage, moves a member off their old Access identity if
 * needed, and starts a session.
 */
export async function googleCallback(
  request: Request,
  env: GoogleEnv,
  deps: Deps = {},
): Promise<Response> {
  if (!configured(env)) return fail("unavailable");
  if (await limited(request, env)) return fail("rate");
  const url = new URL(request.url);
  const stored = readCookie(request, STATE_COOKIE)?.split(".");
  const state = url.searchParams.get("state");
  if (!stored || stored.length < 3 || stored.length > 4 || !state || state !== stored[0])
    return fail("state");
  // Cancelling on Google's screen returns the person to the sign-in card without an error.
  if (url.searchParams.get("error")) return redirect("/account", [cookie(STATE_COOKIE, "", 0)]);
  const [, verifier, nonce, nextSegment] = stored;
  const exchange = await (deps.fetch ?? fetch)(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: url.searchParams.get("code") ?? "",
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl(request),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!exchange.ok) return fail("google");
  const { id_token } = (await exchange.json()) as { id_token?: string };
  let claims: Record<string, unknown>;
  try {
    googleKeys ??= createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
    claims = (
      await jwtVerify(id_token ?? "", deps.keys ?? googleKeys, {
        issuer: GOOGLE_ISSUERS,
        audience: env.GOOGLE_CLIENT_ID,
        algorithms: ["RS256"],
      })
    ).payload;
  } catch {
    return fail("google");
  }
  if (claims.nonce !== nonce || typeof claims.sub !== "string" || !claims.sub)
    return fail("google");
  if (claims.email_verified !== true || typeof claims.email !== "string") return fail("unverified");
  const email = claims.email.toLowerCase();
  const identity: Identity = { subject: `${GOOGLE_SUBJECT_PREFIX}${claims.sub}`, email };
  const repository = new Repository(env.MEMBERSHIP_DB);
  const state0 = await repository.load();
  // Any Google account may sign in; new people stay pending until an administrator approves
  // them. But an address only counts as proof for claiming an invitation, the owner seat or an
  // existing member by email when Google manages it: a Gmail address, or a Workspace account
  // whose hosted domain (hd) is the address's domain. Otherwise Google only checked the address
  // once, when the account was made, and its owner may have changed since.
  if (!googleManages(email, claims.hd) && claimsByEmail(state0, identity)) return fail("email");
  const migration = migrateLegacyIdentity(state0, identity, env.LEGACY_ACCESS_ISSUER, {
    id: crypto.randomUUID(),
    now: new Date().toISOString(),
  });
  if (migration) await repository.commit(state0, migration);
  return redirect(decodeNext(nextSegment) ?? "/account", [
    await createSession(env.MEMBERSHIP_DB, identity, request.headers.get("User-Agent") ?? ""),
    cookie(STATE_COOKIE, "", 0),
  ]);
}
