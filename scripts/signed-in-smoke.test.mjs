import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { checkSignedIn, signedInFixture } from "./signed-in-smoke.mjs";

/** A minimal launcher that behaves correctly unless a fault is switched on. */
async function serve(t, fixture, fault = {}) {
  const { sessions, emails } = fixture;
  const live = new Map([
    [sessions.owner, "owner"],
    [sessions.ownerPhone, "owner"],
    [sessions.ownerTablet, "owner"],
    [sessions.pending, "pending"],
    [sessions.newcomer, "newcomer"],
  ]);
  let joined = false;
  let writes = 0;
  const server = createServer(async (request, response) => {
    const origin = `http://${request.headers.host}`;
    const session = /__Host-slice_session=([^;]+)/.exec(request.headers.cookie ?? "")?.[1];
    const who = live.get(session);
    const send = (status, body, headers = {}) => {
      response.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "private, no-store",
        ...headers,
      });
      response.end(body === undefined ? undefined : JSON.stringify(body));
    };
    const sameOrigin = request.headers.origin === origin;
    const path = new URL(request.url, origin).pathname;
    if (path === "/api/auth/logout") {
      if (!sameOrigin) return send(403, { error: "Sign out from Slice." });
      let body = "";
      for await (const chunk of request) body += chunk;
      if (body === "everywhere=1" && !fault.everywhereEndsOneSession) {
        for (const [token, person] of live) if (person === who) live.delete(token);
      } else if (!fault.signOutKeepsSession) live.delete(session);
      return send(303, undefined, {
        location: "/account",
        "set-cookie": "__Host-slice_session=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/",
      });
    }
    if (!who) return send(401, { error: "Sign in to Slice." });
    if (path === "/api/membership" && request.method === "POST") {
      if (!sameOrigin) return send(403, { error: "This request must come from the Slice app." });
      if (joined && !fault.unlimitedWrites && ++writes > 30)
        return send(429, { error: "Too many changes at once." });
      joined = true;
      return send(200, { revision: 1, me: { email: emails.newcomer, status: "pending" } });
    }
    if (path === "/api/membership") {
      if (who === "owner")
        return send(200, {
          me: { email: emails.owner, status: "active" },
          permissions: ["app.alumni.open"],
          members: joined ? [{ email: emails.newcomer, status: "pending" }] : [],
        });
      if (who === "pending")
        return send(200, { me: { status: "pending" }, permissions: [], members: [] });
      return joined
        ? send(200, { revision: 1, me: { email: emails.newcomer, status: "pending" } })
        : send(200, { needsEnrollment: true });
    }
    const permitted = who === "owner" || fault.pendingReadsRecords;
    if (path === "/api/apps/alumni/records")
      return permitted ? send(200, { alumni: [] }) : send(403, { error: "No access." });
    if (path === "/apps/alumni")
      return who === "owner"
        ? send(200, undefined, { "content-type": "text/html" })
        : send(307, undefined, { location: "/account" });
    return send(404, { error: "Not found." });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("the seed stores a hash of each session token, never the token", () => {
  const { sql, sessions } = signedInFixture();
  for (const value of Object.values(sessions)) {
    assert.equal(value.length, 43);
    assert.ok(!sql.includes(value), "Raw session token found in seed SQL");
    assert.ok(sql.includes(createHash("sha256").update(value).digest("hex")));
  }
});

test("passes a launcher that enforces sessions, membership and sign-out", async (t) => {
  const fixture = signedInFixture();
  await checkSignedIn(await serve(t, fixture), fixture);
});

test("fails when a pending member can read app records", async (t) => {
  const fixture = signedInFixture();
  await assert.rejects(
    checkSignedIn(await serve(t, fixture, { pendingReadsRecords: true }), fixture),
    /pending member must not reach the app API/,
  );
});

test("fails when signing out leaves the session working", async (t) => {
  const fixture = signedInFixture();
  await assert.rejects(
    checkSignedIn(await serve(t, fixture, { signOutKeepsSession: true }), fixture),
    /signed-out session must stop working/,
  );
});

test("fails when one person can make changes without limit", async (t) => {
  const fixture = signedInFixture();
  await assert.rejects(
    checkSignedIn(await serve(t, fixture, { unlimitedWrites: true }), fixture),
    /burst of changes from one person must be refused/,
  );
});

test("fails when signing out everywhere leaves another device signed in", async (t) => {
  const fixture = signedInFixture();
  await assert.rejects(
    checkSignedIn(await serve(t, fixture, { everywhereEndsOneSession: true }), fixture),
    /Signing out everywhere must end every session/,
  );
});
