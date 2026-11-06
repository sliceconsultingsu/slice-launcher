import { describe, expect, it } from "vitest";
import type { GrantSummary, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { disconnect, listConnections, type ConnectionDeps } from "./connections";
import { ActivityStore } from "./activity";
import { grantUserId } from "./oauth";
import { emptyState, enroll } from "../membership/domain";
import { MembershipError, type Identity, type State } from "../membership/contracts";

const identity: Identity = {
  subject: "https://test.cloudflareaccess.com|connections",
  email: "connections@example.test",
};
const other: Identity = {
  subject: "https://test.cloudflareaccess.com|other",
  email: "other@example.test",
};
const created = Date.parse("2026-11-01T09:00:00Z") / 1000;

function state(status: "active" | "suspended" = "active"): State {
  let next = enroll(
    emptyState(null),
    { ...identity, emailManaged: true },
    { id: "connections", now: "synthetic" },
  ).state;
  next = enroll(next, { ...other, emailManaged: true }, { id: "other", now: "synthetic" }).state;
  next.members.forEach((member) => (member.status = "active"));
  next.members[0].status = status;
  return next;
}

function memoryKv() {
  const data = new Map<string, string>();
  return {
    get: async (key: string) => data.get(key) ?? null,
    put: async (key: string, value: string) => void data.set(key, value),
    delete: async (key: string) => void data.delete(key),
  } as unknown as KVNamespace;
}

async function setup(grants: Record<string, Partial<GrantSummary>[]>) {
  const byUser = new Map<string, GrantSummary[]>();
  for (const [who, list] of Object.entries(grants)) {
    const userId = await grantUserId(who === "me" ? identity.subject : other.subject);
    byUser.set(
      userId,
      list.map((grant, index) => ({
        id: `grant-${who}-${index}`,
        clientId: `client-${index}`,
        userId,
        scope: ["slice"],
        metadata: { clientName: "Claude" },
        createdAt: created,
        ...grant,
      })),
    );
  }
  const revoked: [string, string][] = [];
  const helpers = {
    async listUserGrants(userId: string, options?: { cursor?: string }) {
      const all = byUser.get(userId) ?? [];
      // Two per page, to prove the listing follows cursors.
      const start = options?.cursor ? Number(options.cursor) : 0;
      const items = all.slice(start, start + 2);
      return { items, cursor: start + 2 < all.length ? String(start + 2) : undefined };
    },
    async revokeGrant(grantId: string, userId: string) {
      revoked.push([grantId, userId]);
    },
  } as unknown as OAuthHelpers;
  const activity = new ActivityStore(memoryKv(), () => new Date("2026-11-05T12:00:00Z"));
  const deps = (overrides: Partial<ConnectionDeps> = {}): ConnectionDeps => ({
    helpers,
    activity,
    loadState: async () => state(),
    enabled: true,
    ...overrides,
  });
  return { deps, revoked, activity };
}

describe("connected apps", () => {
  it("lists only the caller's grants with names and times", async () => {
    const { deps, activity } = await setup({
      me: [{}, { metadata: { clientName: "x".repeat(120) } }, { metadata: {} }],
      other: [{}],
    });
    const userId = await grantUserId(identity.subject);
    await activity.touch(userId, "grant-me-0");
    const result = await listConnections(identity, deps());
    expect(result.connections.map((c) => c.id)).toEqual(["grant-me-0", "grant-me-1", "grant-me-2"]);
    expect(result.connections[0]).toEqual({
      id: "grant-me-0",
      name: "Claude",
      connectedAt: "2026-11-01T09:00:00.000Z",
      lastUsedAt: "2026-11-05T12:00:00.000Z",
      lapsesAt: "2026-12-01T09:00:00.000Z",
    });
    expect(result.connections[1].name).toHaveLength(80);
    expect(result.connections[2].name).toBe("Unnamed app");
    expect(result.connections[2].lastUsedAt).toBeNull();
  });

  it("measures the lapse from the last renewal", async () => {
    const { deps, activity } = await setup({ me: [{}] });
    await activity.renewed(await grantUserId(identity.subject), "grant-me-0");
    const [connection] = (await listConnections(identity, deps())).connections;
    expect(connection.lapsesAt).toBe("2026-12-05T12:00:00.000Z");
  });

  it("uses the library's own expiry when the grant has one", async () => {
    const { deps } = await setup({
      me: [{ expiresAt: Date.parse("2026-11-20T00:00:00Z") / 1000 }],
    });
    const [connection] = (await listConnections(identity, deps())).connections;
    expect(connection.lapsesAt).toBe("2026-11-20T00:00:00.000Z");
  });

  it("requires an active member", async () => {
    const { deps } = await setup({ me: [{}] });
    await expect(
      listConnections(identity, deps({ loadState: async () => state("suspended") })),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("reports the enabled flag", async () => {
    const { deps } = await setup({ me: [] });
    expect((await listConnections(identity, deps({ enabled: false }))).enabled).toBe(false);
    expect((await listConnections(identity, deps())).enabled).toBe(true);
  });

  it("disconnect revokes the grant and clears its activity", async () => {
    const { deps, revoked, activity } = await setup({ me: [{}] });
    const userId = await grantUserId(identity.subject);
    await activity.touch(userId, "grant-me-0");
    await disconnect(identity, "grant-me-0", deps());
    expect(revoked).toEqual([["grant-me-0", userId]]);
    expect(await activity.get(userId, "grant-me-0")).toEqual({ lastUsedAt: null, renewedAt: null });
  });

  it("disconnect of another member's grant is 404", async () => {
    const { deps, revoked } = await setup({ me: [{}], other: [{}] });
    const error = await disconnect(identity, "grant-other-0", deps()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MembershipError);
    expect((error as MembershipError).status).toBe(404);
    expect(revoked).toEqual([]);
  });
});
