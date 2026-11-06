// Evaluation-only permission matrix from the 2026-10-16 readiness review. It is not part of
// the CI suite. Run from platform/:
//   pnpm exec vitest run --config tests/evaluation/vitest.config.ts permission-matrix
// Every request goes through the real signature verifier, membership handler, platform
// dispatch, MCP adapter and D1 repository. Identities and records are synthetic.
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { z } from "zod";

vi.mock("../../src/lib/apps", () => ({
  apps: [
    {
      id: "matrix",
      name: "Matrix",
      description: "Evaluation-only app",
      permissions: [{ id: "records.edit", label: "Edit records" }],
    },
  ],
}));

import { apps } from "../../src/lib/apps";
import { database, migrate, reset } from "../database";
import { verifyIdentity } from "../../src/membership/auth";
import { errorResponse, membershipRequest } from "../../src/membership/api";
import { Repository } from "../../src/membership/repository";
import { MembershipError } from "../../src/membership/contracts";
import type { Member, View } from "../../src/membership/contracts";
import { organizationRole } from "../../src/membership/access-summary";
import { createPlatform } from "../../src/platform/dispatch";
import { createMcpAdapter } from "../../src/platform/mcp";
import { defineAppTool } from "../../src/platform/mcp-tool";
import type { AppModule } from "../../src/platform/contracts";

const ORIGIN = "https://slice.example";
const config = { issuer: "https://eval.cloudflareaccess.com", audience: "slice-eval" };
const people = {
  owner: "owner@example.test",
  admin: "admin@example.test",
  auditor: "auditor@example.test",
  member: "member@example.test",
  pending: "pending@example.test",
  suspended: "suspended@example.test",
  invited: "invited@example.test",
  unknown: "unknown@example.test",
} as const;
type Person = keyof typeof people;
type Role = Person | "service" | "forged" | "unsigned";
const roles: Role[] = [...(Object.keys(people) as Person[]), "service", "forged", "unsigned"];

let fixture: Awaited<ReturnType<typeof database>>;
let repo: Repository;
let keys: ReturnType<typeof createLocalJWKSet>;
let signer: CryptoKey;
let forger: CryptoKey;
const tokens = new Map<Role, string | null>();
const ids = new Map<Person, string>();
const levelIds = new Map<string, string>();
const results: { role: Role; operation: string; expected: string; observed: string }[] = [];

async function sign(sub: string, payload: Record<string, unknown>, key = signer) {
  return new SignJWT({ type: "app", ...payload })
    .setProtectedHeader({ alg: "RS256", kid: "eval" })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key);
}
function withToken(token: string | null, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (token) headers.set("cf-access-jwt-assertion", token);
  return { ...init, headers };
}
async function membership(token: string | null, body?: unknown, query = "") {
  const request = new Request(
    `${ORIGIN}/api/membership${query}`,
    withToken(
      token,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: { origin: ORIGIN, "content-type": "application/json" },
            body: JSON.stringify(body),
          },
    ),
  );
  // Mirrors platform/app/api/membership/route.ts.
  try {
    const identity = await verifyIdentity(request, config, keys);
    return await membershipRequest(request, identity, repo);
  } catch (error) {
    return errorResponse(error);
  }
}
async function command(token: string | null, input: Record<string, unknown>) {
  // A fresh screen: the client sends the revision it just loaded.
  return membership(token, { revision: (await repo.load()).revision, command: input });
}
async function view(token: string | null) {
  return (await (await membership(token)).json()) as View;
}
async function memberRecord(person: Person): Promise<Member> {
  const found = (await repo.load()).members.find((m) => m.id === ids.get(person));
  if (!found) throw new Error(`No record for ${person}`);
  return found;
}
async function update(actor: Role, person: Person, changes: Partial<Member>) {
  const target = await memberRecord(person);
  return command(tokens.get(actor) ?? null, {
    type: "member.update",
    id: target.id,
    status: changes.status ?? target.status,
    levelId: changes.levelId === undefined ? target.levelId : changes.levelId,
    allow: changes.allow ?? target.allow,
    deny: changes.deny ?? target.deny,
    owner: changes.owner ?? target.owner,
  });
}

const appModule: AppModule = {
  Page: ({ context }) => `Private page for ${context.member.id}`,
  api: ({ method, context }) => {
    if (method === "POST") context.requirePermission("records.edit");
    return Response.json({ ok: true, member: context.member.id });
  },
  tools: [
    defineAppTool({
      name: "edit",
      description: "Edit a synthetic record",
      permission: "records.edit",
      readOnly: false,
      inputSchema: z.object({ note: z.string().max(40) }).strict(),
      execute: ({ note }, context) => ({ note, by: context.member.id }),
    }),
  ],
};
const dependencies = {
  catalog: apps,
  modules: new Map([["matrix", appModule]]),
  verify: (request: Request) => verifyIdentity(request, config, keys),
  loadState: () => repo.load(),
};
const platform = createPlatform(dependencies);
const mcp = createMcpAdapter(dependencies);

async function appApi(token: string | null, method: "GET" | "POST") {
  const init: RequestInit =
    method === "GET"
      ? {}
      : { method, headers: { origin: ORIGIN, "content-type": "application/json" }, body: "{}" };
  const response = await platform.api(
    new Request(`${ORIGIN}/api/apps/matrix/records`, withToken(token, init)),
    "matrix",
    ["records"],
  );
  return response.status;
}
async function appPage(token: string | null) {
  try {
    await platform.page(new Request(`${ORIGIN}/`, withToken(token)), "matrix", {
      path: [],
      searchParams: {},
    });
    return 200;
  } catch (error) {
    if (error instanceof MembershipError) return error.status;
    throw error;
  }
}
const rpcSchema = z.object({
  result: z
    .object({
      tools: z.array(z.object({ name: z.string() })).optional(),
      isError: z.boolean().optional(),
      structuredContent: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  error: z.unknown().optional(),
});
async function mcpRpc(token: string | null, method: string, params: Record<string, unknown> = {}) {
  const response = await mcp(
    new Request(
      `${ORIGIN}/mcp`,
      withToken(token, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2025-11-25",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    ),
  );
  const body = response.headers.get("content-type")?.includes("json")
    ? rpcSchema.safeParse(await response.json())
    : undefined;
  return { status: response.status, body: body?.success ? body.data : undefined };
}
async function toolNames(token: string | null) {
  const { status, body } = await mcpRpc(token, "tools/list");
  return status === 200 ? (body?.result?.tools ?? []).map((t) => t.name).join(",") : `${status}`;
}
async function visibleApps(token: string | null) {
  const { status, body } = await mcpRpc(token, "tools/call", { name: "slice_apps", arguments: {} });
  if (status !== 200) return `${status}`;
  const listed = z
    .object({ apps: z.array(z.object({ id: z.string() })) })
    .safeParse(body?.result?.structuredContent);
  return listed.success ? listed.data.apps.map((a) => a.id).join(",") || "(none)" : "error";
}
function record(role: Role, operation: string, expected: string | number, observed: unknown) {
  results.push({ role, operation, expected: String(expected), observed: String(observed) });
  expect.soft(String(observed), `${role}: ${operation}`).toBe(String(expected));
}

beforeAll(async () => {
  fixture = await database();
  await migrate(fixture.db);
  await reset(fixture.db);
  repo = new Repository(fixture.db);
  const pair = await generateKeyPair("RS256");
  signer = pair.privateKey;
  forger = (await generateKeyPair("RS256")).privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "eval" }] });
  for (const [person, email] of Object.entries(people) as [Person, string][])
    tokens.set(person, await sign(`sub-${person}`, { email }));
  // Shape of a Cloudflare Access service-token assertion: common_name, no human email.
  tokens.set("service", await sign("", { common_name: "ci.access" }));
  tokens.set("forged", await sign("sub-owner", { email: people.owner }, forger));
  tokens.set("unsigned", null);

  // Seed through the real API, the way an owner would set up the organization.
  for (const person of ["owner", "admin", "auditor", "member", "pending", "suspended"] as const) {
    const response = await membership(tokens.get(person) ?? null, { command: { type: "join" } });
    ids.set(person, ((await response.json()) as View).me.id);
  }
  for (const [name, permissions] of [
    ["Delegated admin", ["members.read", "members.manage", "levels.manage", "app.matrix.open"]],
    ["Activity reviewer", ["audit.read"]],
  ] as const) {
    const saved = await command(tokens.get("owner") ?? null, {
      type: "level.save",
      name,
      permissions,
    });
    const level = ((await saved.json()) as View).levels.find((l) => l.name === name);
    if (!level) throw new Error(`Level ${name} was not created`);
    levelIds.set(name, level.id);
  }
  expect(
    (await update("owner", "admin", { status: "active", levelId: levelIds.get("Delegated admin") }))
      .status,
  ).toBe(200);
  expect(
    (
      await update("owner", "auditor", {
        status: "active",
        levelId: levelIds.get("Activity reviewer"),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await update("owner", "member", {
        status: "active",
        levelId: "member",
        allow: ["app.matrix.open"],
      })
    ).status,
  ).toBe(200);
  expect((await update("owner", "suspended", { status: "active", levelId: "member" })).status).toBe(
    200,
  );
  expect((await update("owner", "suspended", { status: "suspended" })).status).toBe(200);
  const invited = await command(tokens.get("owner") ?? null, {
    type: "member.add",
    email: people.invited,
    name: "Invited person",
    levelId: "member",
  });
  expect(invited.status).toBe(200);
  ids.set(
    "invited",
    ((await invited.json()) as View).members.find((m) => "email" in m && m.email === people.invited)
      ?.id ?? "",
  );
}, 60_000);

afterAll(async () => {
  if (process.env.SLICE_EVAL_OUTPUT)
    writeFileSync(process.env.SLICE_EVAL_OUTPUT, JSON.stringify(results, null, 2));
  await fixture?.runtime.dispose();
});

describe("role x operation matrix (read-only operations first)", () => {
  const expected: Record<string, Record<Role, string | number>> = {
    "GET /api/membership": {
      owner: 200,
      admin: 200,
      auditor: 200,
      member: 200,
      pending: 200,
      suspended: 200,
      invited: "200 needsEnrollment",
      unknown: "200 needsEnrollment",
      service: 401,
      forged: 401,
      unsigned: 401,
    },
    "GET /api/membership?view=history": {
      owner: 200,
      admin: 403,
      auditor: 200,
      member: 403,
      pending: 403,
      suspended: 403,
      invited: "200 needsEnrollment",
      unknown: "200 needsEnrollment",
      service: 401,
      forged: 401,
      unsigned: 401,
    },
    "app page /apps/matrix": {
      owner: 200,
      admin: 200,
      auditor: 403,
      member: 200,
      pending: 403,
      suspended: 403,
      invited: 403,
      unknown: 403,
      service: 401,
      forged: 401,
      unsigned: 401,
    },
    "GET /api/apps/matrix (app.open)": {
      owner: 200,
      admin: 200,
      auditor: 403,
      member: 200,
      pending: 403,
      suspended: 403,
      invited: 403,
      unknown: 403,
      service: 401,
      forged: 401,
      unsigned: 401,
    },
    "POST /api/apps/matrix (records.edit)": {
      owner: 200,
      admin: 403,
      auditor: 403,
      member: 403,
      pending: 403,
      suspended: 403,
      invited: 403,
      unknown: 403,
      service: 401,
      forged: 401,
      unsigned: 401,
    },
    "MCP tools/list": {
      owner: "slice_apps,matrix__edit",
      admin: "slice_apps",
      auditor: "slice_apps",
      member: "slice_apps",
      pending: 403,
      suspended: 403,
      invited: 403,
      unknown: 403,
      service: 401,
      forged: 401,
      unsigned: 401,
    },
    "MCP slice_apps": {
      owner: "matrix",
      admin: "matrix",
      auditor: "(none)",
      member: "matrix",
      pending: 403,
      suspended: 403,
      invited: 403,
      unknown: 403,
      service: 401,
      forged: 401,
      unsigned: 401,
    },
  };
  it.each(roles)("%s", async (role) => {
    const token = tokens.get(role) ?? null;
    const describeGet = async (query = "") => {
      const response = await membership(token, undefined, query);
      const body = (await response.json()) as { needsEnrollment?: boolean };
      return body.needsEnrollment ? `${response.status} needsEnrollment` : response.status;
    };
    record(role, "GET /api/membership", expected["GET /api/membership"][role], await describeGet());
    record(
      role,
      "GET /api/membership?view=history",
      expected["GET /api/membership?view=history"][role],
      await describeGet("?view=history"),
    );
    record(
      role,
      "app page /apps/matrix",
      expected["app page /apps/matrix"][role],
      await appPage(token),
    );
    record(
      role,
      "GET /api/apps/matrix (app.open)",
      expected["GET /api/apps/matrix (app.open)"][role],
      await appApi(token, "GET"),
    );
    record(
      role,
      "POST /api/apps/matrix (records.edit)",
      expected["POST /api/apps/matrix (records.edit)"][role],
      await appApi(token, "POST"),
    );
    record(role, "MCP tools/list", expected["MCP tools/list"][role], await toolNames(token));
    record(role, "MCP slice_apps", expected["MCP slice_apps"][role], await visibleApps(token));
  });
});

describe("private fields and role labels", () => {
  it("shows each role only the fields it may see", async () => {
    const member = await view(tokens.get("member") ?? null);
    expect(member.members.length).toBe(4); // active people only: owner, admin, auditor, member
    for (const entry of member.members)
      expect(Object.keys(entry).sort()).toEqual(["id", "levelName", "name", "title"]);
    expect(member.levels).toEqual([]);
    expect(member.catalog).toEqual([]);
    const auditor = await view(tokens.get("auditor") ?? null);
    expect(auditor.members).toEqual([]);
    const pending = await view(tokens.get("pending") ?? null);
    expect([pending.members, pending.levels, pending.catalog, pending.permissions]).toEqual([
      [],
      [],
      [],
      [],
    ]);
    const admin = await view(tokens.get("admin") ?? null);
    // Managers see full records, including pending/invited emails: intended for approval work.
    expect(admin.members.some((m) => "email" in m && m.email === people.pending)).toBe(true);
  });
  it("labels effective authority, not level names", async () => {
    const labels: Record<string, string> = {};
    for (const person of ["owner", "admin", "auditor", "member", "pending", "suspended"] as const) {
      const v = await view(tokens.get(person) ?? null);
      labels[person] = organizationRole(v.me, v.permissions);
    }
    expect(labels).toEqual({
      owner: "Admin (owner)",
      admin: "Admin",
      auditor: "Activity reviewer",
      member: "Member",
      pending: "No organization access",
      suspended: "No organization access",
    });
  });
});

describe("writes and delegation", () => {
  it("allows self-service profile edits only for non-suspended people", async () => {
    const statuses: Record<string, number> = {};
    for (const role of roles) {
      const response = await command(tokens.get(role) ?? null, {
        type: "profile.update",
        name: `Synthetic ${role}`,
        title: "",
      });
      statuses[role] = response.status;
    }
    expect(statuses).toEqual({
      owner: 200,
      admin: 200,
      auditor: 200,
      member: 200,
      pending: 200,
      suspended: 403,
      invited: 403,
      unknown: 403,
      service: 401,
      forged: 401,
      unsigned: 401,
    });
  });
  it("lets only managers add members and create levels", async () => {
    const add: Record<string, number> = {};
    const level: Record<string, number> = {};
    for (const role of roles) {
      add[role] = (
        await command(tokens.get(role) ?? null, {
          type: "member.add",
          email: `added-by-${role}@example.test`,
          name: "Added",
          levelId: "member",
        })
      ).status;
      level[role] = (
        await command(tokens.get(role) ?? null, {
          type: "level.save",
          name: `Level by ${role}`,
          permissions: ["members.read"],
        })
      ).status;
    }
    const managers = {
      owner: 200,
      admin: 200,
      auditor: 403,
      member: 403,
      pending: 403,
      suspended: 403,
      invited: 403,
      unknown: 403,
      service: 401,
      forged: 401,
      unsigned: 401,
    };
    expect(add).toEqual(managers);
    expect(level).toEqual(managers);
  });
  it("prevents a delegated admin exceeding or editing its own authority", async () => {
    const member = await memberRecord("member");
    const outcomes = {
      grantAuditRead: (await update("admin", "member", { allow: [...member.allow, "audit.read"] }))
        .status,
      assignHigherLevel: (
        await update("admin", "member", { levelId: levelIds.get("Activity reviewer") })
      ).status,
      grantUnheldAppAction: (
        await update("admin", "member", { allow: [...member.allow, "app.matrix.records.edit"] })
      ).status,
      modifyOwner: (await update("admin", "owner", {})).status,
      grantOwnership: (await update("admin", "member", { owner: true })).status,
      editSelf: (await update("admin", "admin", { allow: ["audit.read"] })).status,
      editOwnLevel: (
        await command(tokens.get("admin") ?? null, {
          type: "level.save",
          id: levelIds.get("Delegated admin"),
          name: "Delegated admin",
          permissions: ["members.read", "members.manage", "levels.manage", "app.matrix.open"],
        })
      ).status,
      suspendHigherPrivilegedPeer: (await update("admin", "auditor", { status: "suspended" }))
        .status,
      createLevelBeyondOwn: (
        await command(tokens.get("admin") ?? null, {
          type: "level.save",
          name: "Escalation",
          permissions: ["audit.read"],
        })
      ).status,
      approvePending: (await update("admin", "pending", { status: "active", levelId: "member" }))
        .status,
    };
    expect(outcomes).toEqual({
      grantAuditRead: 403,
      assignHigherLevel: 403,
      grantUnheldAppAction: 403,
      modifyOwner: 403,
      grantOwnership: 403,
      editSelf: 403,
      editOwnLevel: 403,
      suspendHigherPrivilegedPeer: 403,
      createLevelBeyondOwn: 403,
      approvePending: 200,
    });
    expect((await update("owner", "pending", { status: "pending", levelId: null })).status).toBe(
      200,
    );
  });
  it("blocks cross-user edits by ordinary members", async () => {
    const other = await memberRecord("admin");
    expect(
      (
        await command(tokens.get("member") ?? null, {
          type: "profile.update",
          id: other.id,
          name: "Hijack",
          title: "",
        })
      ).status,
    ).toBe(400);
    expect((await update("member", "admin", { status: "suspended" })).status).toBe(403);
  });
});

describe("revocation, last owner and identity linking", () => {
  it("applies revocation and suspension to the next request with the same sign-in", async () => {
    const token = tokens.get("member") ?? null;
    expect(await appApi(token, "GET")).toBe(200);
    expect(
      (await update("owner", "member", { allow: ["app.matrix.open", "app.matrix.records.edit"] }))
        .status,
    ).toBe(200);
    expect(await appApi(token, "POST")).toBe(200);
    expect(await toolNames(token)).toBe("slice_apps,matrix__edit");
    expect((await update("owner", "member", { deny: ["app.matrix.records.edit"] })).status).toBe(
      200,
    );
    expect(await appApi(token, "POST")).toBe(403);
    expect(await toolNames(token)).toBe("slice_apps");
    expect((await update("owner", "member", { status: "suspended" })).status).toBe(200);
    expect([await appApi(token, "GET"), await appPage(token), await toolNames(token)]).toEqual([
      403,
      403,
      "403",
    ]);
    expect(
      (await update("owner", "member", { status: "active", allow: ["app.matrix.open"], deny: [] }))
        .status,
    ).toBe(200);
  });
  it("keeps at least one active owner", async () => {
    expect((await update("owner", "owner", { owner: false })).status).toBe(400);
    expect((await update("owner", "owner", { status: "suspended" })).status).toBe(400);
    expect((await update("owner", "admin", { owner: true })).status).toBe(200);
    expect((await update("owner", "owner", { owner: false })).status).toBe(200);
    // The new owner can restore the original owner; the demoted owner can no longer act as owner.
    expect((await update("owner", "admin", { owner: false })).status).toBe(403);
    expect((await update("admin", "owner", { owner: true })).status).toBe(200);
    expect((await update("owner", "admin", { owner: false })).status).toBe(200);
  });
  it("does not let a changed email or a second identity take over a membership", async () => {
    const renamed = await sign("sub-member", { email: "renamed@example.test" });
    expect((await membership(renamed)).status).toBe(403);
    expect(await appApi(renamed, "GET")).toBe(403);
    expect(await toolNames(renamed)).toBe("403");
    const impostor = await sign("sub-other-account", { email: people.member });
    expect(await (await membership(impostor)).json()).toEqual({ needsEnrollment: true });
    expect((await membership(impostor, { command: { type: "join" } })).status).toBe(403);
    expect(await appApi(impostor, "GET")).toBe(403);
    const mixedCase = await sign("sub-member", { email: "Member@Example.test" });
    expect(await appApi(mixedCase, "GET")).toBe(200);
    const serviceWithEmail = await sign("sub-ci", {
      email: people.owner,
      common_name: "ci.access",
    });
    expect((await membership(serviceWithEmail)).status).toBe(401);
  });
  it("activates an invited person on first sign-in without a separate approval step", async () => {
    const response = await membership(tokens.get("invited") ?? null, { command: { type: "join" } });
    const joined = (await response.json()) as View;
    expect([joined.me.status, joined.me.levelId]).toEqual(["active", "member"]);
  });
  it("locks out every existing member, including the owner, if the Access team domain changes", async () => {
    // Subjects are stored as `${issuer}|${sub}` (auth.ts). An account/team migration changes the
    // issuer, so the same people arrive with new subjects and are treated as different identities.
    const migrated = {
      subject: "https://new-team.cloudflareaccess.com|sub-owner",
      email: people.owner,
    };
    const request = (body?: unknown) =>
      new Request(
        `${ORIGIN}/api/membership`,
        body === undefined
          ? {}
          : {
              method: "POST",
              headers: { origin: ORIGIN, "content-type": "application/json" },
              body: JSON.stringify(body),
            },
      );
    const call = async (body?: unknown) => {
      try {
        return await membershipRequest(request(body), migrated, repo);
      } catch (error) {
        return errorResponse(error);
      }
    };
    expect(await (await call()).json()).toEqual({ needsEnrollment: true });
    const join = await call({ command: { type: "join" } });
    expect(join.status).toBe(403);
    expect(await join.json()).toEqual({
      error: "This email is already linked to a different identity. Contact an administrator.",
    });
  });
});
