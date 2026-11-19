import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { database, migrate, reset } from "../../tests/database";
import { createSession, endSession, SESSION_COOKIE } from "../membership/session";
import { APP_COOKIE, appIdentity, issuePass, redeemPass } from "./app-sessions";

let fixture: Awaited<ReturnType<typeof database>>;
beforeAll(async () => {
  fixture = await database();
  await migrate(fixture.db);
}, 30_000);
beforeEach(async () => {
  await reset(fixture.db);
  await fixture.db.prepare("DELETE FROM sessions").run();
});
afterAll(async () => {
  await fixture?.runtime.dispose();
});

const ana = { subject: "ana-sub", email: "ana@example.test", emailManaged: true };
const value = (setCookie: string) => setCookie.split(";")[0].split("=")[1];
/** A browser signed in to the launcher: the request it would send there. */
async function signedIn(identity = ana) {
  const setCookie = await createSession(fixture.db, identity, "test browser");
  return new Request("https://slice.example/api/app-pass", {
    headers: { Cookie: `${SESSION_COOKIE}=${value(setCookie)}` },
  });
}
const atApp = (appId: string, token: string | null) =>
  new Request(`https://${appId}.slice.example/`, {
    headers: token ? { Cookie: `${APP_COOKIE}=${token}` } : {},
  });
/** Signs the browser in at one app and returns its app session token. */
async function enter(appId: string, launcher: Request) {
  const pass = await issuePass(fixture.db, launcher, appId);
  const setCookie = await redeemPass(fixture.db, appId, pass ?? "");
  if (!setCookie) throw new Error("Expected the pass to be accepted");
  return value(setCookie);
}

describe("a one-time pass from the launcher to one app", () => {
  it("signs the person in at that app, with a cookie only that address holds", async () => {
    const launcher = await signedIn();
    const pass = await issuePass(fixture.db, launcher, "notes");
    expect(pass).toHaveLength(43);
    const setCookie = await redeemPass(fixture.db, "notes", pass!);
    expect(setCookie).toMatch(
      /^__Host-slice_app=[\w-]{43}; Max-Age=86400; HttpOnly; Secure; SameSite=Lax; Path=\/$/,
    );
    expect(await appIdentity(fixture.db, "notes", atApp("notes", value(setCookie!)))).toEqual(ana);
  });

  it("works once", async () => {
    const pass = await issuePass(fixture.db, await signedIn(), "notes");
    expect(await redeemPass(fixture.db, "notes", pass!)).not.toBeNull();
    expect(await redeemPass(fixture.db, "notes", pass!)).toBeNull();
  });

  it("is refused at another app, and is used up by the attempt", async () => {
    const pass = await issuePass(fixture.db, await signedIn(), "notes");
    expect(await redeemPass(fixture.db, "ledger", pass!)).toBeNull();
    expect(await redeemPass(fixture.db, "notes", pass!)).toBeNull();
  });

  it("lasts a minute", async () => {
    const pass = await issuePass(fixture.db, await signedIn(), "notes");
    const row = await fixture.db.prepare("SELECT expires_at FROM app_passes").first<{
      expires_at: string;
    }>();
    const left = Date.parse(row!.expires_at) - Date.now();
    expect(left).toBeGreaterThan(50_000);
    expect(left).toBeLessThanOrEqual(60_000);
    await fixture.db.prepare("UPDATE app_passes SET expires_at = '2020-01-01T00:00:00.000Z'").run();
    expect(await redeemPass(fixture.db, "notes", pass!)).toBeNull();
  });

  it("is not issued to a browser that is not signed in to the launcher", async () => {
    const none = new Request("https://slice.example/api/app-pass");
    expect(await issuePass(fixture.db, none, "notes")).toBeNull();
    const forged = new Request("https://slice.example/api/app-pass", {
      headers: { Cookie: `${SESSION_COOKIE}=${"x".repeat(43)}` },
    });
    expect(await issuePass(fixture.db, forged, "notes")).toBeNull();
  });

  it("is refused if the person signed out of the launcher before using it", async () => {
    const launcher = await signedIn();
    const pass = await issuePass(fixture.db, launcher, "notes");
    await endSession(launcher, fixture.db);
    expect(await redeemPass(fixture.db, "notes", pass!)).toBeNull();
  });

  it.each(["", "short", "x".repeat(43), "x".repeat(500)])("refuses the made-up pass %j", async (pass) => {
    expect(await redeemPass(fixture.db, "notes", pass)).toBeNull();
  });

  it("stores only hashes of passes and session tokens", async () => {
    const launcher = await signedIn();
    const pass = await issuePass(fixture.db, launcher, "notes");
    const stored = await fixture.db.prepare("SELECT hash FROM app_passes").first<{ hash: string }>();
    expect(stored!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored!.hash).not.toContain(pass);
    const token = value((await redeemPass(fixture.db, "notes", pass!))!);
    const session = await fixture.db
      .prepare("SELECT hash FROM app_sessions")
      .first<{ hash: string }>();
    expect(session!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(session!.hash).not.toContain(token);
  });
});

describe("a session at an app's address", () => {
  it("is nobody without a cookie, or with a made-up one", async () => {
    expect(await appIdentity(fixture.db, "notes", atApp("notes", null))).toBeNull();
    expect(await appIdentity(fixture.db, "notes", atApp("notes", "x".repeat(43)))).toBeNull();
  });

  it("does not work at another app", async () => {
    const token = await enter("notes", await signedIn());
    expect(await appIdentity(fixture.db, "ledger", atApp("ledger", token))).toBeNull();
    expect(await appIdentity(fixture.db, "notes", atApp("notes", token))).toEqual(ana);
  });

  it("is not the launcher's session, and the launcher's is not it", async () => {
    const launcher = await signedIn();
    const token = await enter("notes", launcher);
    const launcherToken = value(launcher.headers.get("Cookie")!.replace(";", ""));
    expect(await appIdentity(fixture.db, "notes", atApp("notes", launcherToken))).toBeNull();
    const asLauncher = new Request("https://slice.example/", {
      headers: { Cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(await issuePass(fixture.db, asLauncher, "notes")).toBeNull();
  });

  it("ends when the person signs out of the launcher", async () => {
    const launcher = await signedIn();
    const token = await enter("notes", launcher);
    await endSession(launcher, fixture.db);
    expect(await appIdentity(fixture.db, "notes", atApp("notes", token))).toBeNull();
  });

  it("ends when every session of the person is ended, as suspension does", async () => {
    const token = await enter("notes", await signedIn());
    const other = await enter("notes", await signedIn({ ...ana, subject: "max-sub", email: "max@example.test" }));
    await fixture.db.prepare("DELETE FROM sessions WHERE subject = ?").bind("ana-sub").run();
    expect(await appIdentity(fixture.db, "notes", atApp("notes", token))).toBeNull();
    expect(await appIdentity(fixture.db, "notes", atApp("notes", other))).toMatchObject({
      subject: "max-sub",
    });
  });

  it("lasts a day", async () => {
    const token = await enter("notes", await signedIn());
    await fixture.db.prepare("UPDATE app_sessions SET expires_at = '2020-01-01T00:00:00.000Z'").run();
    expect(await appIdentity(fixture.db, "notes", atApp("notes", token))).toBeNull();
  });

  it("clears out expired passes and sessions, and ones whose launcher session is gone", async () => {
    const gone = await signedIn();
    await enter("notes", gone);
    await issuePass(fixture.db, gone, "notes");
    await endSession(gone, fixture.db);
    await enter("notes", await signedIn());
    const count = async (table: string) =>
      (await fixture.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
    expect(await count("app_sessions")).toBe(1);
    expect(await count("app_passes")).toBe(0);
  });
});
