import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { database, migrate } from "../../tests/database";
import { googleCallback, googleStart, safeNext, type GoogleEnv } from "./google";
import { sessionIdentity, SESSION_COOKIE } from "./session";
import { Repository } from "./repository";
import { enroll } from "./domain";

const origin = "https://slice.example";
const legacyIssuer = "https://snowy-voice-36a1.cloudflareaccess.com";
let fixture: Awaited<ReturnType<typeof database>>;
let keys: JWTVerifyGetKey;
let privateKey: CryptoKey;
let allowed = true;

beforeAll(async () => {
  fixture = await database();
  await migrate(fixture.db);
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "test" }] });
}, 30_000);
afterAll(async () => {
  await fixture?.runtime.dispose();
});
beforeEach(async () => {
  allowed = true;
  await fixture.db.prepare("DELETE FROM sessions").run();
  await fixture.db.prepare("DELETE FROM members").run();
});

function env(overrides: Partial<GoogleEnv> = {}): GoogleEnv {
  return {
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    ALLOWED_EMAIL_DOMAIN: "g.syr.edu",
    LEGACY_ACCESS_ISSUER: legacyIssuer,
    AUTH_LIMITER: { limit: async () => ({ success: allowed }) } as unknown as RateLimit,
    MEMBERSHIP_DB: fixture.db as unknown as D1Database,
    ...overrides,
  };
}

async function idToken(claims: Record<string, unknown>) {
  return new SignJWT({ email: "ana@g.syr.edu", email_verified: true, name: "Ana", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer("https://accounts.google.com")
    .setAudience(typeof claims.aud === "string" ? claims.aud : "client-id")
    .setSubject(typeof claims.sub === "string" ? claims.sub : "google-sub-1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

/** Runs start, then the callback with Google's token response built from `claims`. */
async function signIn(claims: Record<string, unknown> = {}, options: { next?: string } = {}) {
  const start = await googleStart(
    new Request(
      `${origin}/api/auth/google/start${options.next ? `?next=${encodeURIComponent(options.next)}` : ""}`,
    ),
    env(),
  );
  const location = new URL(start.headers.get("location") ?? "");
  const stateCookie = (start.headers.get("set-cookie") ?? "").split(";")[0];
  const nonce = location.searchParams.get("nonce");
  const state = location.searchParams.get("state");
  const exchanged: URLSearchParams[] = [];
  const response = await googleCallback(
    new Request(`${origin}/api/auth/google/callback?code=abc&state=${state}`, {
      headers: { Cookie: stateCookie },
    }),
    env(),
    {
      keys,
      fetch: async (_input, init) => {
        exchanged.push(new URLSearchParams(String(init?.body)));
        return Response.json({ id_token: await idToken({ nonce, ...claims }) });
      },
    },
  );
  return { start, location, response, exchanged };
}

function sessionCookie(response: Response) {
  const cookies = response.headers.getSetCookie();
  return cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`) && !c.includes("Max-Age=0"));
}

describe("Google sign-in", () => {
  it("start sends the browser to Google with PKCE, state and nonce", async () => {
    const { start, location } = await signIn();
    expect(start.status).toBe(302);
    expect(location.origin + location.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(location.searchParams.get("client_id")).toBe("client-id");
    expect(location.searchParams.get("redirect_uri")).toBe(`${origin}/api/auth/google/callback`);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("scope")).toBe("openid email profile");
    expect(location.searchParams.get("hd")).toBe("g.syr.edu");
    expect(start.headers.get("set-cookie")).toMatch(
      /^__Host-slice_oauth=.*Max-Age=600; HttpOnly; Secure/,
    );
  });

  it("a verified Syracuse account gets a session and lands on the account page", async () => {
    const { response, exchanged } = await signIn();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/account");
    expect(exchanged[0].get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const cookie = sessionCookie(response);
    expect(cookie).toBeDefined();
    const token = /=([^;]*)/.exec(cookie ?? "")?.[1];
    const identity = await sessionIdentity(
      new Request(origin, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }),
      fixture.db,
    );
    expect(identity).toEqual({
      subject: "https://accounts.google.com|google-sub-1",
      email: "ana@g.syr.edu",
    });
  });

  it("returns to the AI approval page when asked, and nowhere else", async () => {
    expect(
      (await signIn({}, { next: "/authorize?client_id=x" })).response.headers.get("location"),
    ).toBe("/authorize?client_id=x");
    expect(
      (await signIn({}, { next: "https://evil.example/" })).response.headers.get("location"),
    ).toBe("/account");
  });

  it.each([
    ["unverified email", { email_verified: false }, "unverified"],
    ["another email domain", { email: "ana@gmail.com" }, "domain"],
    ["a lookalike domain", { email: "ana@evilg.syr.edu" }, "domain"],
    ["a wrong nonce", { nonce: "replayed" }, "google"],
    ["a token for another app", { aud: "other-client" }, "google"],
  ])("refuses %s", async (_label, claims, code) => {
    const { response } = await signIn(claims as Record<string, unknown>);
    expect(response.headers.get("location")).toBe(`/account?sign_in_error=${code}`);
    expect(sessionCookie(response)).toBeUndefined();
  });

  it("refuses a callback whose state does not match the browser's", async () => {
    const response = await googleCallback(
      new Request(`${origin}/api/auth/google/callback?code=abc&state=forged`, {
        headers: { Cookie: "__Host-slice_oauth=real.verifier.nonce" },
      }),
      env(),
      { keys, fetch: async () => Response.json({}) },
    );
    expect(response.headers.get("location")).toBe("/account?sign_in_error=state");
  });

  it("fails closed when Google sign-in is not configured", async () => {
    const response = await googleStart(
      new Request(`${origin}/api/auth/google/start`),
      env({ GOOGLE_CLIENT_SECRET: "" }),
    );
    expect(response.headers.get("location")).toBe("/account?sign_in_error=unavailable");
  });

  it("is rate limited per address", async () => {
    allowed = false;
    const response = await googleStart(new Request(`${origin}/api/auth/google/start`), env());
    expect(response.headers.get("location")).toBe("/account?sign_in_error=rate");
  });

  it("re-links a member from their old Access identity on first Google sign-in", async () => {
    const repo = new Repository(fixture.db as unknown as D1Database);
    const state = await repo.load();
    const enrolled = enroll(
      state,
      { subject: `${legacyIssuer}|access-uuid`, email: "ana@g.syr.edu" },
      { id: "ana", now: "2026-10-01T00:00:00.000Z" },
    );
    if (!enrolled.audit) throw new Error("expected enrollment");
    await repo.commit(state, { ...enrolled, audit: enrolled.audit });
    await signIn();
    const after = await repo.load();
    expect(after.members[0].subject).toBe("https://accounts.google.com|google-sub-1");
    expect((await repo.history())[0]).toMatchObject({ action: "member.identity_migrated" });
  });
});

describe("safeNext", () => {
  it("only allows the AI approval page", () => {
    expect(safeNext("/authorize?client_id=x")).toBe("/authorize?client_id=x");
    for (const value of [
      null,
      "/",
      "/account",
      "//evil.example/authorize?x",
      "/authorize\\@evil",
      "https://evil.example/authorize?x",
    ])
      expect(safeNext(value)).toBeNull();
  });
});
