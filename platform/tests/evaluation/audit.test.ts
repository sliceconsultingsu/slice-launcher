// Scenario 6: audit consistency, ordering and reachability of history.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyCommand } from "../../src/membership/domain";
import { Repository } from "../../src/membership/repository";
import type { View } from "../../src/membership/contracts";
import {
  client,
  inspect,
  memberUpdate,
  openFixture,
  people,
  reset,
  signer,
  subjectOf,
  standardOrg,
} from "./harness";
import type { Client, Fixture, Signer } from "./harness";

let fixture: Fixture;
let auth: Signer;
let api: Client;
beforeAll(async () => {
  fixture = await openFixture();
  auth = await signer();
  api = client(fixture.db, auth);
}, 30_000);
beforeEach(async () => reset(fixture.db));
afterAll(async () => fixture?.runtime.dispose());

describe("scenario 6: one audit row per successful mutation, matching stored state", () => {
  it("every step adds exactly one audit row, bumps the revision by one, and before/after match D1", async () => {
    const db = inspect(fixture.db);
    const stored = async (targetId: string, action: string) =>
      action.startsWith("level.") ? db.level(targetId) : db.member(targetId);
    const latest = async () => (await api.view(people.owner)).revision;
    let previousDocs = new Map<string, unknown>();
    const snapshotDocs = async () => {
      const docs = new Map<string, unknown>();
      const rows = await fixture.db
        .prepare(
          "SELECT id, document FROM members UNION ALL SELECT id, document FROM access_levels",
        )
        .all<{ id: string; document: string }>();
      for (const row of rows.results) docs.set(row.id, JSON.parse(row.document));
      return docs;
    };
    const step = async (label: string, run: () => Promise<Response>) => {
      const revision = await db.revision();
      const count = await db.auditCount();
      previousDocs = await snapshotDocs();
      const response = await run();
      expect(response.status, label).toBe(200);
      expect(await db.revision(), label).toBe(revision + 1);
      expect(await db.auditCount(), label).toBe(count + 1);
      const audit = (await db.audits()).at(-1);
      if (!audit) throw new Error("missing audit");
      expect(audit.after, `${label}: after == stored`).toEqual(
        await stored(audit.targetId, audit.action),
      );
      expect(audit.before, `${label}: before == prior stored`).toEqual(
        previousDocs.get(audit.targetId) ?? null,
      );
      return response;
    };
    await step("owner sign-in", () => api.join(people.owner));
    const bea = (await (await step("bea sign-in", () => api.join(people.bea))).json()) as View;
    await step("approve bea", async () =>
      api.command(
        people.owner,
        await latest(),
        memberUpdate(bea.me.id, "active", { allow: ["members.manage"] }),
      ),
    );
    const level = (await (
      await step("create level", async () =>
        api.command(people.owner, await latest(), {
          type: "level.save",
          name: "Analysts",
          permissions: ["members.read"],
        }),
      )
    ).json()) as View;
    const analysts = level.levels.find((l) => l.name === "Analysts");
    await step("invite dana", async () =>
      api.command(people.owner, await latest(), {
        type: "member.add",
        email: "dana@example.test",
        name: "Dana",
        levelId: "member",
      }),
    );
    await step("dana accepts", () => api.join({ sub: "dana-sub", email: "dana@example.test" }));
    await step("bea profile", async () =>
      api.command(people.bea, await latest(), {
        type: "profile.update",
        name: "Bea",
        title: "Lead",
      }),
    );
    await step("edit level", async () =>
      api.command(people.owner, await latest(), {
        type: "level.save",
        id: analysts?.id,
        name: "Senior analysts",
        permissions: ["audit.read", "members.read"],
      }),
    );
    expect(await db.guardCount()).toBe(0);
  });
});

describe("scenario 6: ordering", () => {
  async function commitAt(ids: string[], ats: string[]) {
    const repo = new Repository(fixture.db);
    for (const [index, id] of ids.entries()) {
      const state = await repo.load();
      await repo.commit(
        state,
        applyCommand(
          state,
          subjectOf(people.bea),
          { type: "profile.update", name: `Bea ${index}`, title: "" },
          { id, now: ats[index] },
        ),
      );
    }
  }
  it("audits sharing the same `at` are returned newest-first (rowid tie-break)", async () => {
    await standardOrg(api);
    const at = "2030-01-01T12:00:00.000Z"; // later than the setup rows
    await commitAt(["same-1", "same-2", "same-3"], [at, at, at]);
    const { history } = await api.history(people.owner);
    expect(history.slice(0, 3).map((h) => h.id)).toEqual(["same-3", "same-2", "same-1"]);
  });

  it("characterization: order follows wall-clock `at`, not commit order; audits carry no revision", async () => {
    await standardOrg(api);
    // Simulates two Worker instances whose clocks differ by 4 s committing back to back.
    await commitAt(
      ["committed-first", "committed-second"],
      ["2030-01-01T12:00:05.000Z", "2030-01-01T12:00:01.000Z"],
    );
    const { history } = await api.history(people.owner);
    expect(history.slice(0, 2).map((h) => h.id)).toEqual(["committed-first", "committed-second"]);
    expect(Object.keys(history[0]).sort()).toEqual(
      ["action", "actorId", "after", "at", "before", "id", "targetId"].sort(),
    );
  });
});

describe("scenario 6: history beyond 50 entries", () => {
  it("characterization: only the newest 50 are reachable through the product; paging params are ignored", async () => {
    await standardOrg(api);
    const repo = new Repository(fixture.db);
    for (let index = 0; index < 52; index += 1) {
      const state = await repo.load();
      await repo.commit(
        state,
        applyCommand(
          state,
          subjectOf(people.bea),
          { type: "profile.update", name: `Bea ${index}`, title: "" },
          {
            id: `bulk-${String(index).padStart(2, "0")}`,
            now: new Date(Date.now() + index).toISOString(),
          },
        ),
      );
    }
    const total = await inspect(fixture.db).auditCount();
    expect(total).toBeGreaterThan(50);
    const oldest = (
      await fixture.db
        .prepare("SELECT id FROM access_audit ORDER BY at ASC, rowid ASC LIMIT ?")
        .bind(total - 50)
        .all<{ id: string }>()
    ).results.map((row: { id: string }) => row.id);
    for (const query of [
      "?view=history",
      "?view=history&offset=50",
      "?view=history&page=2",
      "?view=history&limit=500",
      `?view=history&before=${encodeURIComponent(new Date().toISOString())}`,
    ]) {
      const { history } = await api.history(people.owner, query);
      expect(history, query).toHaveLength(50);
      expect(
        history.some((h) => oldest.includes(h.id)),
        query,
      ).toBe(false);
    }
    console.info(
      `[eval] audit rows in D1: ${total}; unreachable via API: ${oldest.length} (${oldest.join(", ")})`,
    );
  });
});
