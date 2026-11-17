import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import console from "node:console";

// Signed-in checks for the built Worker. The browser tests run a hand-built server, so this is the
// only check that sends a real session cookie through the compiled routes and a real local D1.
// Everything here is synthetic: the people, the sessions and the database are made for one run.

const COOKIE = "__Host-slice_session";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
/** Same shape as the app's session token: 32 random bytes, base64url, 43 characters. */
const token = () => randomBytes(32).toString("base64url");

function member(id, email, fields) {
  return {
    id,
    subject: `google|smoke-${id}`,
    email,
    name: `Smoke ${id}`,
    title: "",
    status: "pending",
    levelId: null,
    allow: [],
    deny: [],
    owner: false,
    joinedAt: "2026-01-01T00:00:00.000Z",
    ...fields,
  };
}

/**
 * Seed rows for a migrated, otherwise empty membership database, plus the session tokens that
 * belong to them. The database stores only each token's hash, exactly as sign-in does.
 */
export function signedInFixture(now = new Date()) {
  const hour = 3600_000;
  const at = (offsetMs) => new Date(now.getTime() + offsetMs).toISOString();
  const owner = member("owner", "owner@smoke.example", {
    status: "active",
    levelId: "member",
    owner: true,
  });
  const pending = member("pending", "pending@smoke.example", {});
  const newcomer = { subject: "google|smoke-newcomer", email: "newcomer@smoke.example" };
  const sessions = { owner: token(), pending: token(), newcomer: token(), expired: token() };
  const rows = [
    // Last seen two hours ago, so the first request also exercises sliding renewal.
    [sessions.owner, owner, at(-2 * hour), at(24 * hour)],
    [sessions.pending, pending, at(-60_000), at(24 * hour)],
    [sessions.newcomer, newcomer, at(-60_000), at(24 * hour)],
    [sessions.expired, owner, at(-48 * hour), at(-hour)],
  ];
  const sql = [
    ...[owner, pending].map(
      (m) =>
        `INSERT INTO members(id, email, subject, document) VALUES (${quote(m.id)}, ${quote(m.email)}, ${quote(m.subject)}, ${quote(JSON.stringify(m))});`,
    ),
    `UPDATE organization SET revision = 2, owner_email = ${quote(owner.email)}, owner_claimed = 1 WHERE id = 'slice';`,
    ...rows.map(
      ([value, who, seen, expires]) =>
        `INSERT INTO sessions (hash, subject, email, email_managed, created_at, expires_at, last_seen_at, user_agent) VALUES (${quote(sha256(value))}, ${quote(who.subject)}, ${quote(who.email)}, 1, ${quote(seen)}, ${quote(expires)}, ${quote(seen)}, 'smoke');`,
    ),
  ].join("\n");
  return { sql: sql + "\n", sessions, emails: { owner: owner.email, newcomer: newcomer.email } };
}

/**
 * Signed-in behaviour of a running launcher seeded with `signedInFixture`: an active member
 * reaches their data and an app, a pending member and an expired or unknown session do not, a new
 * person can join as pending, and signing out ends the session on the server.
 */
export async function checkSignedIn(baseUrl, { sessions, emails }) {
  const origin = new URL(baseUrl).origin;
  const call = async (path, session, init = {}) =>
    fetch(new URL(path, baseUrl), {
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      ...init,
      headers: { ...(session ? { Cookie: `${COOKIE}=${session}` } : {}), ...init.headers },
    });
  const status = async (path, session, init) => {
    const response = await call(path, session, init);
    await response.body?.cancel();
    return response.status;
  };
  const post = (body, headers) => ({
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  // An active member reaches their own record, the app API and the app page.
  const mine = await call("/api/membership", sessions.owner);
  assert.equal(mine.status, 200, "A signed-in member must reach their membership");
  assert.match(mine.headers.get("cache-control") ?? "", /no-store/);
  const view = await mine.json();
  assert.equal(view.me.email, emails.owner);
  assert.ok(view.permissions.includes("app.alumni.open"), "An owner holds every permission");
  const records = await call("/api/apps/alumni/records", sessions.owner);
  assert.equal(records.status, 200, "A permitted member must reach the app API");
  assert.match(records.headers.get("cache-control") ?? "", /no-store/);
  await records.body?.cancel();
  const page = await call("/apps/alumni", sessions.owner);
  assert.equal(page.status, 200, "A permitted member must reach the app page");
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  await page.body?.cancel();

  // A pending member is signed in but holds nothing.
  const waiting = await call("/api/membership", sessions.pending);
  assert.equal(waiting.status, 200);
  const waitingView = await waiting.json();
  assert.equal(waitingView.me.status, "pending");
  assert.deepEqual(waitingView.permissions, []);
  assert.deepEqual(waitingView.members, [], "A pending member must not see the directory");
  assert.equal(
    await status("/api/apps/alumni/records", sessions.pending),
    403,
    "A pending member must not reach the app API",
  );
  const refused = await call("/apps/alumni", sessions.pending);
  await refused.body?.cancel();
  assert.ok(
    [302, 303, 307, 308].includes(refused.status) &&
      new URL(refused.headers.get("location") ?? "", baseUrl).pathname === "/account",
    "A pending member must be sent to their account, not the app page",
  );

  // Expired, unknown and missing sessions are all signed out.
  for (const [name, session] of [
    ["expired", sessions.expired],
    ["unknown", token()],
    ["missing", undefined],
  ])
    assert.equal(
      await status("/api/membership", session),
      401,
      `A request with ${name === "missing" ? "no" : "an " + name} session must be refused`,
    );

  // A new person joins as pending. Writes must come from the app's own origin.
  const before = await call("/api/membership", sessions.newcomer);
  assert.deepEqual(await before.json(), { needsEnrollment: true });
  const join = { command: { type: "join" } };
  assert.equal(
    await status("/api/membership", sessions.newcomer, post(join)),
    403,
    "A write without the app's origin must be refused",
  );
  assert.equal(
    await status(
      "/api/membership",
      sessions.newcomer,
      post(join, { Origin: "https://example.com" }),
    ),
    403,
    "A write from another site must be refused",
  );
  const joined = await call("/api/membership", sessions.newcomer, post(join, { Origin: origin }));
  assert.equal(joined.status, 200, "A new person must be able to join");
  const joinedView = await joined.json();
  assert.equal(joinedView.me.email, emails.newcomer);
  assert.equal(joinedView.me.status, "pending", "A new person waits for approval");
  const listing = await (await call("/api/membership", sessions.owner)).text();
  assert.ok(
    !listing.includes('"subject"') && !listing.includes("google|smoke"),
    "The member list must not send sign-in account IDs to the browser",
  );
  const directory = JSON.parse(listing);
  assert.ok(
    directory.members.some((m) => m.email === emails.newcomer && m.status === "pending"),
    "The stored membership must include the new pending person",
  );

  // One person cannot make changes without limit. Saving the same profile again writes nothing,
  // so this exercises only the per-person allowance (30 a minute; a new minute may start midway).
  const profile = { type: "profile.update", name: "Smoke Newcomer", title: "" };
  const burst = [];
  for (let i = 0; i < 62 && !burst.includes(429); i++) {
    const { revision } = await (await call("/api/membership", sessions.newcomer)).json();
    burst.push(
      await status(
        "/api/membership",
        sessions.newcomer,
        post({ revision, command: profile }, { Origin: origin }),
      ),
    );
  }
  assert.equal(burst[0], 200, "A person must be able to save their profile");
  assert.ok(burst.includes(429), "A burst of changes from one person must be refused");
  assert.ok(
    burst.slice(0, -1).every((code) => code === 200),
    "Changes before the limit must succeed",
  );
  assert.equal(
    await status("/api/membership", sessions.owner),
    200,
    "One person's limit must not affect anyone else",
  );

  // Signing out ends the session on the server, and another site cannot do it for you.
  assert.equal(
    await status("/api/auth/logout", sessions.owner, {
      method: "POST",
      headers: { Origin: "https://example.com" },
    }),
    403,
    "Another site must not be able to sign a member out",
  );
  assert.equal(await status("/api/membership", sessions.owner), 200);
  const out = await call("/api/auth/logout", sessions.owner, {
    method: "POST",
    headers: { Origin: origin },
  });
  await out.body?.cancel();
  assert.equal(out.status, 303, "Signing out must redirect to the account page");
  assert.match(out.headers.get("set-cookie") ?? "", new RegExp(`^${COOKIE}=; Max-Age=0;`));
  assert.equal(
    await status("/api/membership", sessions.owner),
    401,
    "A signed-out session must stop working on the server",
  );
  console.log(
    "Signed-in checks passed: member access, pending and expired refusal, joining, write limit, sign-out.",
  );
}
