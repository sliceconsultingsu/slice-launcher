// One-time upload addresses. A member's AI that can run commands asks for one, then sends the
// app's files to it in a single request from a terminal, where there is no browser session. The
// address stands for that member and that app, once, for ten minutes; membership and who runs the
// app are still checked when it is used.
import type { Identity } from "../membership/contracts";
import { digest, secret } from "../membership/session";

const UPLOAD_MS = 600_000;
type Database = Pick<D1Database, "prepare" | "batch">;

/** A new address's token for this member and app. Only its hash is stored. */
export async function startUpload(
  db: Database,
  identity: Identity,
  appId: string,
  preview: boolean,
): Promise<string> {
  const token = secret();
  const now = new Date();
  await db.batch([
    db.prepare("DELETE FROM app_uploads WHERE expires_at <= ?").bind(now.toISOString()),
    db
      .prepare(
        "INSERT INTO app_uploads (hash, app_id, subject, email, preview, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        await digest(token),
        appId,
        identity.subject,
        identity.email,
        preview ? 1 : 0,
        new Date(now.getTime() + UPLOAD_MS).toISOString(),
      ),
  ]);
  return token;
}

/** Who and what a token stands for, using it up. Null if it is unknown, used or expired. */
export async function takeUpload(
  db: Database,
  token: string,
): Promise<{ appId: string; identity: Identity; preview: boolean } | null> {
  if (token.length !== 43) return null;
  const row = await db
    .prepare(
      "DELETE FROM app_uploads WHERE hash = ? RETURNING app_id, subject, email, preview, expires_at",
    )
    .bind(await digest(token))
    .first<{
      app_id: string;
      subject: string;
      email: string;
      preview: number;
      expires_at: string;
    }>();
  if (!row || row.expires_at <= new Date().toISOString()) return null;
  return {
    appId: row.app_id,
    identity: { subject: row.subject, email: row.email },
    preview: row.preview === 1,
  };
}
