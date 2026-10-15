import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { database, migrate, reset } from "../../tests/database";
import { verifyIdentity } from "../membership/auth";
import { Repository } from "../membership/repository";
import { enroll } from "../membership/domain";
import { createPlatform } from "./dispatch";
import type { AppModule, AppPageProps, AppApiProps } from "./contracts";

vi.mock("../lib/apps", () => ({
  apps: [
    {
      id: "example",
      name: "Example",
      description: "",
      permissions: [{ id: "records.edit", label: "Edit records" }],
    },
    { id: "other", name: "Other", description: "", permissions: [] },
  ],
}));
import { apps } from "../lib/apps";
const config = { issuer: "https://test.cloudflareaccess.com", audience: "slice-aud" };
let fixture: Awaited<ReturnType<typeof database>>;
let repo: Repository;
let pair: Awaited<ReturnType<typeof generateKeyPair>>;
let keys: ReturnType<typeof createLocalJWKSet>;
let jwt: string;
const page = vi.fn<(props: AppPageProps) => string>(() => "Private app page");
const api = vi.fn((props: AppApiProps) => {
  if (props.method === "POST") props.context.requirePermission("records.edit");
  return Response.json(
    { member: props.context.member.id, input: props.input, path: props.path },
    {
      headers: {
        "Cache-Control": "public, max-age=1000",
        "CDN-Cache-Control": "public, max-age=1000",
        "Cloudflare-CDN-Cache-Control": "public, max-age=1000",
      },
    },
  );
});
function platform(module: AppModule = { Page: page, api }) {
  return createPlatform({
    catalog: apps,
    modules: new Map([["example", module]]),
    verify: (request) => verifyIdentity(request, config, keys),
    loadState: () => repo.load(),
  });
}
async function makeToken(payload = {}) {
  return new SignJWT({ sub: "person", email: "person@example.test", type: "app", ...payload })
    .setProtectedHeader({ alg: "RS256", kid: "platform-test" })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(pair.privateKey);
}
function request(method = "GET", token = jwt, origin = "https://slice.example", body = "{}") {
  return new Request("https://slice.example/api/apps/example/records?limit=5", {
    method,
    headers: { "Cf-Access-Jwt-Assertion": token, origin, "content-type": "application/json" },
    body: ["GET", "HEAD"].includes(method) ? undefined : body,
  });
}
async function updateMember(changes: Record<string, unknown>) {
  const state = await repo.load();
  const member = { ...state.members[0], ...changes };
  await fixture.db
    .prepare("UPDATE members SET document = ? WHERE id = ?")
    .bind(JSON.stringify(member), member.id)
    .run();
}
beforeAll(async () => {
  fixture = await database();
  await migrate(fixture.db);
  repo = new Repository(fixture.db);
  pair = await generateKeyPair("RS256");
  keys = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: "platform-test" }],
  });
  jwt = await makeToken();
}, 30_000);
beforeEach(async () => {
  await reset(fixture.db);
  const initial = await repo.load();
  const joined = enroll(
    initial,
    { subject: `${config.issuer}|person`, email: "person@example.test" },
    { id: "person", now: "now" },
  );
  if (!joined.audit) throw new Error("Expected new enrollment");
  await repo.commit(initial, { ...joined, audit: joined.audit });
  await updateMember({ status: "active", levelId: "member", allow: ["app.example.open"] });
  page.mockClear();
  api.mockClear();
});
afterAll(async () => fixture?.runtime.dispose());

it("uses one verified session for page and API, passing a minimal app-scoped context", async () => {
  const host = platform();
  expect(await host.page(request(), "example", { path: [], searchParams: {} })).toBe(
    "Private app page",
  );
  const response = await host.api(request(), "example", ["records"]);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ member: "person", path: ["records"] });
  expect(page.mock.calls[0][0].context.permissions).toEqual(["app.example.open"]);
  expect(page.mock.calls[0][0].context.member).toEqual({
    id: "person",
    name: "",
    email: "person@example.test",
  });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.has("CDN-Cache-Control")).toBe(false);
  expect(response.headers.has("Cloudflare-CDN-Cache-Control")).toBe(false);
});
it.each(["pending", "invited", "suspended"])(
  "blocks %s members on both entry points",
  async (status) => {
    await updateMember({ status });
    const host = platform();
    expect((await host.api(request(), "example", [])).status).toBe(403);
    await expect(
      host.page(request(), "example", { path: [], searchParams: {} }),
    ).rejects.toMatchObject({ status: 403 });
    expect(api).not.toHaveBeenCalled();
    expect(page).not.toHaveBeenCalled();
  },
);
it("does not trust email or permission headers, and rejects service, forged and absent tokens", async () => {
  for (const token of ["", "forged", await makeToken({ type: "service", common_name: "ci" })]) {
    const req = request("GET", token);
    req.headers.set("x-slice-permissions", "*");
    req.headers.set("x-slice-email", "owner@example.test");
    expect((await platform().api(req, "example", [])).status).toBe(401);
    await expect(
      platform().page(req, "example", { path: [], searchParams: {} }),
    ).rejects.toMatchObject({ status: 401 });
  }
  expect(api).not.toHaveBeenCalled();
  expect(page).not.toHaveBeenCalled();
});
it("blocks unenrolled or rebound identities", async () => {
  for (const token of [
    await makeToken({ sub: "new" }),
    await makeToken({ email: "changed@example.test" }),
  ])
    expect((await platform().api(request("GET", token), "example", [])).status).toBe(403);
});
it("requires this app's permission, with revocation winning over access-level grants", async () => {
  await updateMember({ allow: ["app.other.open"] });
  expect((await platform().api(request(), "example", [])).status).toBe(403);
  await fixture.db
    .prepare("UPDATE access_levels SET document = ? WHERE id = 'member'")
    .bind(JSON.stringify({ id: "member", name: "Member", permissions: ["app.example.open"] }))
    .run();
  expect((await platform().api(request(), "example", [])).status).toBe(200);
  await updateMember({ deny: ["app.example.open"], allow: ["app.example.open"] });
  expect((await platform().api(request(), "example", [])).status).toBe(403);
});
it("reloads membership for an existing session after permission revocation or suspension", async () => {
  const host = platform();
  expect((await host.api(request(), "example", [])).status).toBe(200);
  await updateMember({ deny: ["app.example.open"] });
  expect((await host.api(request(), "example", [])).status).toBe(403);
  await updateMember({ deny: [], status: "suspended" });
  await expect(
    host.page(request(), "example", { path: [], searchParams: {} }),
  ).rejects.toMatchObject({ status: 403 });
});
it("uses the shared permission catalog for declared app actions", async () => {
  expect((await platform().api(request("POST"), "example", [])).status).toBe(403);
  await updateMember({ allow: ["app.example.open", "app.example.records.edit"] });
  const response = await platform().api(
    request("POST", jwt, undefined, '{"title":"Example"}'),
    "example",
    [],
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ input: { title: "Example" } });
  await updateMember({ deny: ["app.example.records.edit"] });
  expect((await platform().api(request("POST"), "example", [])).status).toBe(403);
});
it("active owners get declared permissions but cannot request undeclared actions", async () => {
  await updateMember({ owner: true, allow: [] });
  expect((await platform().api(request("POST"), "example", [])).status).toBe(200);
  const host = platform({
    Page: page,
    api: ({ context }) => {
      context.requirePermission("invented");
      return new Response();
    },
  });
  expect((await host.api(request(), "example", [])).status).toBe(403);
});
it("rejects cross-origin, missing-origin, malformed and oversized mutations before app code", async () => {
  const host = platform();
  for (const [origin, body, status] of [
    ["https://attacker.example", "{}", 403],
    ["", "{}", 403],
    ["https://slice.example", "bad", 400],
    ["https://slice.example", "x".repeat(17000), 413],
  ] as const)
    expect((await host.api(request("POST", jwt, origin, body), "example", [])).status).toBe(status);
  expect(api).not.toHaveBeenCalled();
});
it("does not dispatch unknown modules, prototype keys, or missing API handlers", async () => {
  for (const id of ["missing", "constructor", "__proto__", "../example"])
    expect((await platform().api(request(), id, [])).status).toBe(404);
  expect((await platform({ Page: page }).api(request(), "example", [])).status).toBe(404);
  expect(api).not.toHaveBeenCalled();
});
it("blocks unsupported methods and strips HEAD response bodies", async () => {
  expect((await platform().api(request("OPTIONS"), "example", [])).status).toBe(405);
  const response = await platform().api(request("HEAD"), "example", []);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("");
});
it("fails closed when the membership database is unavailable", async () => {
  const host = createPlatform({
    catalog: apps,
    modules: new Map([["example", { Page: page, api }]]),
    verify: (req) => verifyIdentity(req, config, keys),
    loadState: async () => {
      throw new Error("Database unavailable");
    },
  });
  const response = await host.api(request(), "example", []);
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("Database unavailable");
  expect(api).not.toHaveBeenCalled();
});
