import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { database, migrate } from "../../tests/database";
import { createSession, endSession, SESSION_COOKIE, sessionIdentity } from "./session";
import { MembershipError, type SignedInIdentity } from "./contracts";

const identity: SignedInIdentity = {
  subject: "https://accounts.google.com|123",
  email: "ana@g.syr.edu",
  emailManaged: true,
};
let fixture: Awaited<ReturnType<typeof database>>;
beforeAll(async () => {
  fixture = await database();
  await migrate(fixture.db);
}, 30_000);
afterAll(async () => {
  await fixture?.runtime.dispose();
});
beforeEach(async () => {
  await fixture.db.prepare("DELETE FROM sessions").run();
});

const tokenOf = (setCookie: string) => /=([^;]*)/.exec(setCookie)?.[1] ?? "";
const withCookie = (token: string) =>
  new Request("https://slice.example/api/membership", {
    headers: { Cookie: `other=1; ${SESSION_COOKIE}=${token}` },
  });
async function status(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e);
  return error instanceof MembershipError ? error.status : "no error";
}

describe("browser sessions", () => {
  it("issue a host-only, HttpOnly, 30-day cookie and store only a hash", async () => {
    const setCookie = await createSession(fixture.db, identity, "Test browser");
    expect(setCookie).toMatch(/^__Host-slice_session=[A-Za-z0-9_-]{43}; /);
    for (const part of ["Max-Age=2592000", "HttpOnly", "Secure", "SameSite=Lax", "Path=/"])
      expect(setCookie).toContain(part);
    const rows = (await fixture.db.prepare("SELECT * FROM sessions").all()).results as Record<
      string,
      string
    >[];
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(tokenOf(setCookie));
    expect(rows[0]).toMatchObject({ subject: identity.subject, email: identity.email });
  });

  it("resolve the signed-in identity from the cookie", async () => {
    const token = tokenOf(await createSession(fixture.db, identity, ""));
    expect(await sessionIdentity(withCookie(token), fixture.db)).toEqual(identity);
  });

  it("remember whether Google manages the address", async () => {
    const unmanaged = { ...identity, email: "ana@outlook.com", emailManaged: false };
    const token = tokenOf(await createSession(fixture.db, unmanaged, ""));
    expect(await sessionIdentity(withCookie(token), fixture.db)).toEqual(unmanaged);
  });

  it("reject a missing, malformed or unknown cookie", async () => {
    expect(await status(sessionIdentity(new Request("https://slice.example/"), fixture.db))).toBe(
      401,
    );
    expect(await status(sessionIdentity(withCookie("short"), fixture.db))).toBe(401);
    expect(await status(sessionIdentity(withCookie("x".repeat(43)), fixture.db))).toBe(401);
  });

  it("reject an expired session", async () => {
    const token = tokenOf(await createSession(fixture.db, identity, ""));
    await fixture.db
      .prepare("UPDATE sessions SET expires_at = ?")
      .bind("2000-01-01T00:00:00.000Z")
      .run();
    expect(await status(sessionIdentity(withCookie(token), fixture.db))).toBe(401);
  });

  it("record when the session was last seen without extending it", async () => {
    const token = tokenOf(await createSession(fixture.db, identity, ""));
    const old = new Date(Date.now() - 2 * 3600_000).toISOString();
    const soon = new Date(Date.now() + 86400_000).toISOString();
    await fixture.db
      .prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ?")
      .bind(old, soon)
      .run();
    await sessionIdentity(withCookie(token), fixture.db);
    const row = (await fixture.db
      .prepare("SELECT expires_at, last_seen_at FROM sessions")
      .first()) as {
      expires_at: string;
      last_seen_at: string;
    };
    expect(row.expires_at).toBe(soon);
    expect(row.last_seen_at > old).toBe(true);
  });

  it("last 30 days from sign-in on the server, the same as the cookie", async () => {
    await createSession(fixture.db, identity, "");
    const row = (await fixture.db
      .prepare("SELECT created_at, expires_at FROM sessions")
      .first()) as { created_at: string; expires_at: string };
    expect(Date.parse(row.expires_at) - Date.parse(row.created_at)).toBe(30 * 86400_000);
  });

  it("clear out expired sessions whenever someone signs in", async () => {
    const stale = tokenOf(await createSession(fixture.db, identity, "stale"));
    const live = tokenOf(await createSession(fixture.db, identity, "live"));
    await fixture.db
      .prepare("UPDATE sessions SET expires_at = ? WHERE user_agent = 'stale'")
      .bind("2000-01-01T00:00:00.000Z")
      .run();
    await createSession(fixture.db, { ...identity, subject: "someone-else" }, "new");
    const stored = await fixture.db.prepare("SELECT user_agent FROM sessions").all();
    const agents = stored.results.map((row: Record<string, unknown>) => String(row.user_agent));
    expect(agents.sort()).toEqual(["live", "new"]);
    expect(await status(sessionIdentity(withCookie(stale), fixture.db))).toBe(401);
    expect(await sessionIdentity(withCookie(live), fixture.db)).toEqual(identity);
  });

  it("end the session and clear the cookie on sign-out", async () => {
    const token = tokenOf(await createSession(fixture.db, identity, ""));
    const cleared = await endSession(withCookie(token), fixture.db);
    expect(cleared).toContain(`${SESSION_COOKIE}=;`);
    expect(cleared).toContain("Max-Age=0");
    expect(await status(sessionIdentity(withCookie(token), fixture.db))).toBe(401);
  });

  it("sign-out ends only this browser's session unless asked to end them all", async () => {
    const someoneElse = { ...identity, subject: "someone-else", email: "sam@g.syr.edu" };
    const laptop = tokenOf(await createSession(fixture.db, identity, "laptop"));
    const phone = tokenOf(await createSession(fixture.db, identity, "phone"));
    const tablet = tokenOf(await createSession(fixture.db, identity, "tablet"));
    const theirs = tokenOf(await createSession(fixture.db, someoneElse, "theirs"));
    await endSession(withCookie(laptop), fixture.db);
    expect(await status(sessionIdentity(withCookie(laptop), fixture.db))).toBe(401);
    expect(await sessionIdentity(withCookie(phone), fixture.db)).toEqual(identity);

    const cleared = await endSession(withCookie(phone), fixture.db, { everywhere: true });
    expect(cleared).toContain("Max-Age=0");
    for (const token of [phone, tablet])
      expect(await status(sessionIdentity(withCookie(token), fixture.db))).toBe(401);
    expect(await sessionIdentity(withCookie(theirs), fixture.db)).toEqual(someoneElse);
    // An unknown or already-ended session ends nothing.
    await endSession(withCookie(phone), fixture.db, { everywhere: true });
    await endSession(withCookie("x".repeat(43)), fixture.db, { everywhere: true });
    expect(await sessionIdentity(withCookie(theirs), fixture.db)).toEqual(someoneElse);
  });
});
