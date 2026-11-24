// Sign-in at a member app's address. The launcher's session cookie is bound to the launcher's own
// address and is never sent to an app, so a signed-in person is carried across by a one-time pass
// and then holds a separate session for that one app. Both are tied to the launcher session they
// came from: signing out of the launcher, being suspended or being removed ends them at once.
import type { SignedInIdentity } from "../membership/contracts";
import { cookie, digest, readCookie, secret, SESSION_COOKIE } from "../membership/session";

/** Host-only, like the launcher's: an app's page or code can neither read nor set it. */
export const APP_COOKIE = "__Host-slice_app";
/**
 * Marks the browser that started signing in at an app. A pass works only in the browser holding
 * the state it was issued against, so a pass someone obtained for themselves cannot sign another
 * person's browser in as them. Host-only: no other app's address can set it.
 */
export const STATE_COOKIE = "__Host-slice_app_state";
const STATE_SECONDS = 600;
const PASS_MS = 60_000;
const APP_SESSION_MS = 86400_000;

type Database = Pick<D1Database, "prepare" | "batch">;
const well = (token: string | undefined): token is string => token?.length === 43;

/** A fresh state for a browser starting to sign in at an app, and the cookie that holds it. */
export function startState(): { state: string; setCookie: string } {
  const state = secret();
  return { state, setCookie: cookie(STATE_COOKIE, state, STATE_SECONDS) };
}

/**
 * A pass to one app for the browser signed in to the launcher on this request, tied to the state
 * the app's address gave that browser. Null when it is not signed in or the state is unusable.
 * The caller has already checked that this person may open the app.
 */
export async function issuePass(
  db: Database,
  request: Request,
  appId: string,
  state: string,
): Promise<string | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!well(token) || !well(state)) return null;
  const session = await digest(token);
  const now = new Date();
  const live = await db
    .prepare("SELECT 1 AS found FROM sessions WHERE hash = ? AND expires_at > ?")
    .bind(session, now.toISOString())
    .first();
  if (!live) return null;
  const pass = secret();
  await db.batch([
    db.prepare("DELETE FROM app_passes WHERE expires_at <= ?").bind(now.toISOString()),
    db
      .prepare(
        "INSERT INTO app_passes (hash, app_id, session_hash, state_hash, expires_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(
        await digest(pass),
        appId,
        session,
        await digest(state),
        new Date(now.getTime() + PASS_MS).toISOString(),
      ),
  ]);
  return pass;
}

/**
 * Exchanges a pass at the app it was issued for, in the browser that started the sign-in (the
 * request carries its state cookie). Returns the Set-Cookie header for that app's session, or
 * null when the pass is unknown, used, expired, for another app or another browser, or its
 * launcher session has ended. Presenting a pass uses it up, wherever it is presented.
 */
export async function redeemPass(
  db: Database,
  appId: string,
  pass: string,
  request: Request,
): Promise<string | null> {
  if (!well(pass)) return null;
  const now = new Date();
  const row = await db
    .prepare(
      "DELETE FROM app_passes WHERE hash = ? RETURNING app_id, session_hash, state_hash, expires_at",
    )
    .bind(await digest(pass))
    .first<{ app_id: string; session_hash: string; state_hash: string; expires_at: string }>();
  if (!row || row.app_id !== appId || row.expires_at <= now.toISOString()) return null;
  const state = readCookie(request, STATE_COOKIE);
  if (!well(state) || (await digest(state)) !== row.state_hash) return null;
  const live = await db
    .prepare("SELECT 1 AS found FROM sessions WHERE hash = ? AND expires_at > ?")
    .bind(row.session_hash, now.toISOString())
    .first();
  if (!live) return null;
  const token = secret();
  await db.batch([
    // Each sign-in at an app also clears out what can no longer be used.
    db
      .prepare(
        "DELETE FROM app_sessions WHERE expires_at <= ? OR session_hash NOT IN (SELECT hash FROM sessions)",
      )
      .bind(now.toISOString()),
    db
      .prepare(
        "DELETE FROM app_passes WHERE expires_at <= ? OR session_hash NOT IN (SELECT hash FROM sessions)",
      )
      .bind(now.toISOString()),
    db
      .prepare(
        "INSERT INTO app_sessions (hash, app_id, session_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(
        await digest(token),
        appId,
        row.session_hash,
        now.toISOString(),
        new Date(now.getTime() + APP_SESSION_MS).toISOString(),
      ),
  ]);
  return cookie(APP_COOKIE, token, APP_SESSION_MS / 1000);
}

/**
 * Who is signed in at this app on this browser, or null. It proves who signed in, not what they
 * may do: the caller still loads current membership and app access on every request.
 */
export async function appIdentity(
  db: Database,
  appId: string,
  request: Request,
): Promise<SignedInIdentity | null> {
  const token = readCookie(request, APP_COOKIE);
  if (!well(token)) return null;
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      "SELECT s.subject, s.email, s.email_managed FROM app_sessions a JOIN sessions s ON s.hash = a.session_hash WHERE a.hash = ? AND a.app_id = ? AND a.expires_at > ? AND s.expires_at > ?",
    )
    .bind(await digest(token), appId, now, now)
    .first<{ subject: string; email: string; email_managed: number }>();
  return row
    ? { subject: row.subject, email: row.email, emailManaged: row.email_managed === 1 }
    : null;
}
