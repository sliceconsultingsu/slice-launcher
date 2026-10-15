import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { z } from "zod";
import { database, migrate, reset } from "../../tests/database";
import { verifyIdentity } from "../membership/auth";
import { Repository } from "../membership/repository";
import { enroll } from "../membership/domain";
import { createMcpAdapter } from "./mcp";
import { defineAppTool } from "./mcp-tool";
import type { AppContext, AppModule } from "./contracts";
import type { PlatformDependencies } from "./dispatch";

vi.mock("../lib/apps", () => ({
  apps: [
    {
      id: "notes",
      name: "Notes",
      description: "Private notes",
      permissions: [
        { id: "records.read", label: "Read notes" },
        { id: "records.edit", label: "Edit notes" },
      ],
    },
    {
      id: "other",
      name: "Other",
      description: "Other app",
      permissions: [{ id: "records.read", label: "Read" }],
    },
  ],
}));
import { apps } from "../lib/apps";
const responseSchema = z.object({
  result: z
    .object({
      tools: z.array(z.object({ name: z.string() })).optional(),
      isError: z.boolean().optional(),
      structuredContent: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  error: z.unknown().optional(),
});
const rpc = async (response: Response) => responseSchema.parse(await response.json());
const config = { issuer: "https://test.cloudflareaccess.com", audience: "slice-aud" };
let fixture: Awaited<ReturnType<typeof database>>;
let repo: Repository;
let pair: Awaited<ReturnType<typeof generateKeyPair>>;
let keys: ReturnType<typeof createLocalJWKSet>;
let jwt: string;
const run = vi.fn((input: { query: string }, context: AppContext) => ({
  query: input.query,
  memberId: context.member.id,
}));
const read = defineAppTool({
  name: "search",
  description: "Search your private notes",
  permission: "records.read",
  readOnly: true,
  inputSchema: z.object({ query: z.string().min(1).max(80) }).strict(),
  execute: run,
});
const edit = defineAppTool({
  ...read,
  name: "edit",
  permission: "records.edit",
  readOnly: false,
  inputSchema: z.object({ query: z.string() }).strict(),
  execute: run,
});
function dependencies(
  module: AppModule = { Page: () => null, tools: [read, edit] },
): PlatformDependencies {
  return {
    catalog: apps,
    modules: new Map([["notes", module]]),
    verify: (request) => verifyIdentity(request, config, keys),
    loadState: () => repo.load(),
  };
}
async function makeToken(payload: Record<string, unknown> = {}, audience = config.audience) {
  return new SignJWT({ sub: "person", email: "person@example.test", type: "app", ...payload })
    .setProtectedHeader({ alg: "RS256", kid: "mcp-test" })
    .setIssuer(config.issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(typeof payload.exp === "number" ? payload.exp : "5m")
    .sign(pair.privateKey);
}
function request(
  body: unknown = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
  token = jwt,
  headers: Record<string, string> = {},
  method = "POST",
) {
  return new Request("https://slice.example/mcp", {
    method,
    headers: {
      "cf-access-jwt-assertion": token,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
      ...headers,
    },
    body: ["GET", "HEAD"].includes(method)
      ? undefined
      : typeof body === "string"
        ? body
        : JSON.stringify(body),
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
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "mcp-test" }] });
  jwt = await makeToken();
}, 30000);
beforeEach(async () => {
  await reset(fixture.db);
  const initial = await repo.load();
  const joined = enroll(
    initial,
    { subject: `${config.issuer}|person`, email: "person@example.test" },
    { id: "person", now: "now" },
  );
  if (!joined.audit) throw new Error("Expected enrollment");
  await repo.commit(initial, { ...joined, audit: joined.audit });
  await updateMember({
    status: "active",
    levelId: "member",
    allow: ["app.notes.open", "app.notes.records.read"],
  });
  run.mockClear();
});
afterAll(async () => fixture?.runtime.dispose());

it("an SDK client initializes, discovers only permitted tools, and calls with inherited identity", async () => {
  const adapter = createMcpAdapter(dependencies());
  const client = new Client({ name: "slice-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("https://slice.example/mcp"), {
    fetch: async (input, init) => {
      const req = new Request(input, init);
      req.headers.set("cf-access-jwt-assertion", jwt);
      return adapter(req);
    },
  });
  try {
    await client.connect(transport);
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
      "slice_apps",
      "notes__search",
    ]);
    const result = await client.callTool({ name: "notes__search", arguments: { query: "hello" } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({ query: "hello", memberId: "person" });
    expect(run.mock.calls[0][1].permissions).toEqual(["app.notes.open", "app.notes.records.read"]);
    await updateMember({ deny: ["app.notes.records.read"] });
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(["slice_apps"]);
    await expect(
      client.callTool({ name: "notes__search", arguments: { query: "again" } }),
    ).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(1);
  } finally {
    await client.close();
  }
});
it("requires a verified human identity, including for initialize and discovery", async () => {
  for (const token of [
    "",
    "forged",
    await makeToken({}, "other-audience"),
    await makeToken({ exp: 1 }),
    await makeToken({ type: "service", common_name: "ci" }),
  ]) {
    const response = await createMcpAdapter(dependencies())(
      request(undefined, token, {
        "x-slice-permissions": "*",
        "x-slice-email": "owner@example.test",
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  expect(run).not.toHaveBeenCalled();
});
it.each(["pending", "invited", "suspended"])(
  "denies %s membership before protocol handling",
  async (status) => {
    await updateMember({ status });
    expect((await createMcpAdapter(dependencies())(request())).status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  },
);
it("denies unknown and rebound subjects", async () => {
  for (const token of [
    await makeToken({ sub: "unknown" }),
    await makeToken({ email: "changed@example.test" }),
  ])
    expect((await createMcpAdapter(dependencies())(request(undefined, token))).status).toBe(403);
});
it("app.open and a declared action are both required; owner status does not bless undeclared tools", async () => {
  await updateMember({ allow: ["app.notes.records.read"] });
  const response = await createMcpAdapter(dependencies())(request());
  expect((await rpc(response)).result?.tools?.map((t) => t.name)).toEqual(["slice_apps"]);
  await updateMember({ owner: true, allow: [] });
  const invalid = createMcpAdapter(
    dependencies({ Page: () => null, tools: [{ ...read, permission: "undeclared" }] }),
  );
  expect((await invalid(request())).status).toBe(500);
  expect(run).not.toHaveBeenCalled();
});
it("rechecks authorization after discovery even within the same request", async () => {
  const deps = dependencies();
  let loads = 0;
  deps.loadState = async () => {
    if (++loads === 2) await updateMember({ status: "suspended" });
    return repo.load();
  };
  const response = await createMcpAdapter(deps)(
    request({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "notes__search", arguments: { query: "hello" } },
    }),
  );
  expect((await rpc(response)).result?.isError).toBe(true);
  expect(run).not.toHaveBeenCalled();
});
it("rejects cross-origin requests, malformed/oversized JSON and unsupported methods", async () => {
  const adapter = createMcpAdapter(dependencies());
  for (const [body, headers, status] of [
    [undefined, { origin: "https://attacker.example" }, 403],
    [undefined, { origin: "null" }, 403],
    [undefined, { "sec-fetch-site": "cross-site" }, 403],
    ["{broken", {}, 400],
    ["x".repeat(17000), {}, 413],
    [undefined, { "content-type": "text/plain" }, 415],
  ] as const)
    expect((await adapter(request(body, jwt, headers))).status).toBe(status);
  for (const method of ["GET", "HEAD", "DELETE", "OPTIONS", "PUT", "PATCH"]) {
    const response = await adapter(request(undefined, jwt, {}, method));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  }
  expect(run).not.toHaveBeenCalled();
});
it("validates tool inputs and never exposes exception messages or oversized results", async () => {
  const call = (args: unknown) =>
    request({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "notes__search", arguments: args },
    });
  const adapter = createMcpAdapter(dependencies());
  const bad = await adapter(call({ query: 42 }));
  expect((await rpc(bad)).result?.isError).toBe(true);
  expect(run).not.toHaveBeenCalled();
  for (const execute of [
    async () => {
      throw new Error("private database password");
    },
    async () => ({ secret: "x".repeat(66000) }),
  ]) {
    const response = await createMcpAdapter(
      dependencies({ Page: () => null, tools: [{ ...read, execute }] }),
    )(call({ query: "hello" }));
    const body = await response.text();
    expect(body).toContain('"isError":true');
    expect(body).not.toContain("private database password");
    expect(body.length).toBeLessThan(1000);
  }
});
it("fails closed on database failures and duplicate registrations", async () => {
  const deps = dependencies();
  deps.loadState = async () => {
    throw new Error("private db details");
  };
  const response = await createMcpAdapter(deps)(request());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("private db details");
  expect(
    (await createMcpAdapter(dependencies({ Page: () => null, tools: [read, read] }))(request()))
      .status,
  ).toBe(500);
});
it("keeps an empty platform usable without exposing membership or admin tools", async () => {
  const deps = dependencies();
  deps.catalog = [];
  deps.modules = new Map();
  const adapter = createMcpAdapter(deps);
  const response = await adapter(
    request({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "slice_apps", arguments: {} },
    }),
  );
  expect((await rpc(response)).result?.structuredContent).toEqual({ apps: [] });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.has("mcp-session-id")).toBe(false);
});

it("requires explicit action grants for mutations and observes deny precedence", async () => {
  const adapter = createMcpAdapter(dependencies());
  const call = () =>
    request({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "notes__edit", arguments: { query: "updated" } },
    });
  expect((await rpc(await adapter(call()))).error).toBeDefined();
  expect(run).not.toHaveBeenCalled();
  await updateMember({ allow: ["app.notes.open", "app.notes.records.edit"] });
  expect((await rpc(await adapter(call()))).result?.structuredContent).toEqual({
    query: "updated",
    memberId: "person",
  });
  await fixture.db
    .prepare("UPDATE access_levels SET document = ? WHERE id = 'member'")
    .bind(JSON.stringify({ id: "member", name: "Member", permissions: ["app.notes.records.edit"] }))
    .run();
  await updateMember({ deny: ["app.notes.records.edit"] });
  expect((await rpc(await adapter(call()))).error).toBeDefined();
  expect(run).toHaveBeenCalledTimes(1);
  await updateMember({ owner: true, allow: [], deny: [] });
  expect((await rpc(await adapter(call()))).result?.isError).not.toBe(true);
  expect(run).toHaveBeenCalledTimes(2);
});

it("concurrent requests cannot share identity or permission state", async () => {
  const state = await repo.load();
  state.members.push({
    ...state.members[0],
    id: "second",
    subject: `${config.issuer}|second`,
    email: "second@example.test",
  });
  const deps = dependencies();
  deps.loadState = async () => state;
  const adapter = createMcpAdapter(deps);
  const second = await makeToken({ sub: "second", email: "second@example.test" });
  const call = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "notes__search", arguments: { query: "own notes" } },
  };
  const responses = await Promise.all([adapter(request(call)), adapter(request(call, second))]);
  const results = await Promise.all(responses.map(rpc));
  expect(results.map((result) => result.result?.structuredContent?.memberId)).toEqual([
    "person",
    "second",
  ]);
});

it("applies schema transforms once before the typed app handler", async () => {
  const tool = defineAppTool({
    name: "length",
    description: "Count characters",
    permission: "records.read",
    readOnly: true,
    inputSchema: z.object({ query: z.string().transform((value) => value.length) }).strict(),
    execute: ({ query }) => ({ count: query + 1 }),
  });
  const response = await createMcpAdapter(dependencies({ Page: () => null, tools: [tool] }))(
    request({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "notes__length",
        arguments: { query: "hello" },
      },
    }),
  );
  expect((await rpc(response)).result?.structuredContent).toEqual({ count: 6 });
});
