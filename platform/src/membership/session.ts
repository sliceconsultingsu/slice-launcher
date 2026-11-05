import { MembershipError, type Identity } from "./contracts";

/** Host-only cookie: no Domain attribute, Secure, Path=/ (the __Host- prefix enforces this). */
export const SESSION_COOKIE = "__Host-slice_session";
const SESSION_MS = 30 * 86400_000;
/** Sliding renewal is written at most this often per session. */
const SLIDE_MS = 3600_000;

type Database = Pick<D1Database, "prepare">;

/** A random secret, base64url without padding (43 characters for 32 bytes). */
export function secret(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("Cookie") ?? "").split(/;\s*/)) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index) === name) return part.slice(index + 1);
  }
  return undefined;
}

export function cookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax; Path=/`;
}

async function digest(token: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  );
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Starts a browser session for a verified identity and returns its Set-Cookie header. */
export async function createSession(
  db: Database,
  identity: Identity,
  userAgent: string,
): Promise<string> {
  const token = secret();
  const now = new Date();
  await db
    .prepare(
      "INSERT INTO sessions (hash, subject, email, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      await digest(token),
      identity.subject,
      identity.email,
      now.toISOString(),
      new Date(now.getTime() + SESSION_MS).toISOString(),
      now.toISOString(),
      userAgent.slice(0, 200),
    )
    .run();
  return cookie(SESSION_COOKIE, token, SESSION_MS / 1000);
}

/**
 * The signed-in identity behind this browser's session cookie. It proves who signed in, not what
 * they may do: callers still load current membership and permissions on every request.
 */
export async function sessionIdentity(request: Request, db: Database): Promise<Identity> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || token.length !== 43) throw new MembershipError(401, "Sign in to Slice.");
  const key = await digest(token);
  const now = new Date();
  const row = await db
    .prepare("SELECT subject, email, last_seen_at FROM sessions WHERE hash = ? AND expires_at > ?")
    .bind(key, now.toISOString())
    .first<{ subject: string; email: string; last_seen_at: string }>();
  if (!row) throw new MembershipError(401, "Sign in to Slice.");
  if (now.getTime() - Date.parse(row.last_seen_at) > SLIDE_MS)
    await db
      .prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE hash = ?")
      .bind(now.toISOString(), new Date(now.getTime() + SESSION_MS).toISOString(), key)
      .run();
  return { subject: row.subject, email: row.email };
}

/** Ends this browser's session and returns a Set-Cookie header that clears it. */
export async function endSession(request: Request, db: Database): Promise<string> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token)
    await db
      .prepare("DELETE FROM sessions WHERE hash = ?")
      .bind(await digest(token))
      .run();
  return cookie(SESSION_COOKIE, "", 0);
}
