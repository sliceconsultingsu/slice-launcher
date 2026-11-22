// Scenarios 1 (concurrent edits), 2 (stale replay), 4 (lost-response retry), 7 (global revision).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyCommand } from "../../src/membership/domain";
import { Repository } from "../../src/membership/repository";
import type { View } from "../../src/membership/contracts";
import {
  barrier,
  client,
  GatedRepository,
  inspect,
  memberUpdate,
  openFixture,
  people,
  reset,
  signer,
  standardOrg,
  subjectOf,
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

describe("scenario 1: concurrent edits by two admins on the same revision", () => {
  it("repository interleaving load A, load B, commit A, commit B: A wins, B gets 409", async () => {
    const { carolId } = await standardOrg(api);
    const db = inspect(fixture.db);
    const repo = new Repository(fixture.db);
    const stateA = await repo.load();
    const stateB = await repo.load();
    const auditsBefore = await db.auditCount();
    const a = applyCommand(stateA, subjectOf(people.owner), memberUpdate(carolId, "active"), {
      id: "commit-a",
      now: new Date().toISOString(),
    });
    const b = applyCommand(stateB, subjectOf(people.bea), memberUpdate(carolId, "suspended"), {
      id: "commit-b",
      now: new Date().toISOString(),
    });
    await repo.commit(stateA, a);
    await expect(repo.commit(stateB, b)).rejects.toMatchObject({ status: 409 });
    expect((await db.member(carolId))?.status).toBe("active");
    expect(await db.revision()).toBe(stateA.revision + 1);
    expect(await db.auditCount()).toBe(auditsBefore + 1);
    expect((await db.audits()).map((entry: { id: string }) => entry.id)).toContain("commit-a");
    expect((await db.audits()).map((entry: { id: string }) => entry.id)).not.toContain("commit-b");
    expect(await db.guardCount()).toBe(0);
  });

  it("HTTP Promise.all with forced interleaving (both load before either commits): one 200, one 409", async () => {
    const { carolId, revision } = await standardOrg(api);
    const db = inspect(fixture.db);
    const auditsBefore = await db.auditCount();
    const gate = barrier(2);
    const [a, b] = await Promise.all([
      api.command(
        people.owner,
        revision,
        memberUpdate(carolId, "active"),
        new GatedRepository(fixture.db, gate),
      ),
      api.command(
        people.bea,
        revision,
        memberUpdate(carolId, "suspended"),
        new GatedRepository(fixture.db, gate),
      ),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = (await (a.status === 200 ? b : a).json()) as { error: string };
    expect(loser.error).toMatch(/Membership changed/);
    const stored = await db.member(carolId);
    expect(stored?.status).toBe(a.status === 200 ? "active" : "suspended");
    expect(await db.auditCount()).toBe(auditsBefore + 1);
    expect(await db.revision()).toBe(revision + 1);
    const last = (await db.audits()).at(-1);
    expect(last?.after).toEqual(stored);
    expect(await db.guardCount()).toBe(0);
  });

  it("HTTP Promise.all free-running, 15 rounds: never two winners, DB and audit match the winner", async () => {
    const outcomes: string[] = [];
    for (let round = 0; round < 15; round += 1) {
      await reset(fixture.db);
      const { carolId, revision } = await standardOrg(api);
      const db = inspect(fixture.db);
      const auditsBefore = await db.auditCount();
      const [a, b] = await Promise.all([
        api.command(people.owner, revision, memberUpdate(carolId, "active")),
        api.command(people.bea, revision, memberUpdate(carolId, "suspended")),
      ]);
      outcomes.push(`${a.status}/${b.status}`);
      expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1);
      expect([a.status, b.status].filter((s) => s === 409)).toHaveLength(1);
      const expected = a.status === 200 ? "active" : "suspended";
      expect((await db.member(carolId))?.status).toBe(expected);
      expect(await db.auditCount()).toBe(auditsBefore + 1);
      expect(await db.guardCount()).toBe(0);
    }
    console.info(`[eval] free-running owner/bea outcomes: ${outcomes.join(", ")}`);
  });
});

describe("scenario 2: stale replay", () => {
  it("rejects an earlier 'activate' replayed after a later 'suspend'", async () => {
    const { carolId, revision } = await standardOrg(api);
    const db = inspect(fixture.db);
    const activateBody = { revision, command: memberUpdate(carolId, "active") };
    const activated = await api.send(people.owner, activateBody);
    expect(activated.status).toBe(200);
    const afterActivate = (await activated.json()) as View;
    const suspended = await api.command(
      people.owner,
      afterActivate.revision,
      memberUpdate(carolId, "suspended"),
    );
    expect(suspended.status).toBe(200);
    const auditsBefore = await db.auditCount();
    const replay = await api.send(people.owner, activateBody);
    expect(replay.status).toBe(409);
    expect((await db.member(carolId))?.status).toBe("suspended");
    expect(await db.auditCount()).toBe(auditsBefore);
    expect(await db.guardCount()).toBe(0);
  });
});

describe("scenario 4: lost response then retry with the old revision", () => {
  it("client never sees the 200, retries the same body: 409, change applied exactly once", async () => {
    const { carolId, revision } = await standardOrg(api);
    const db = inspect(fixture.db);
    const auditsBefore = await db.auditCount();
    const body = { revision, command: memberUpdate(carolId, "active") };
    const first = await api.send(people.owner, body); // response "lost" in transit
    expect(first.status).toBe(200);
    const retry = await api.send(people.owner, body);
    expect(retry.status).toBe(409);
    expect(((await retry.json()) as { error: string }).error).toBe(
      "Membership changed. Reload before saving.",
    );
    expect((await db.member(carolId))?.status).toBe("active");
    expect(await db.auditCount()).toBe(auditsBefore + 1);
  });

  it("D1 commits but the Worker sees a transport error: user gets 500, retry 409, data saved once", async () => {
    const { carolId, revision } = await standardOrg(api);
    const db = inspect(fixture.db);
    const auditsBefore = await db.auditCount();
    let commits = 0;
    const lossy = {
      prepare: fixture.db.prepare.bind(fixture.db),
      batch: (async (statements: D1PreparedStatement[]) => {
        const result = await fixture.db.batch(statements);
        // load() is a 3-statement batch; commit() batches are larger. Lose only the commit reply.
        if (statements.length > 3 && commits++ === 0) throw new Error("network connection lost");
        return result;
      }) as D1Database["batch"],
    };
    const body = { revision, command: memberUpdate(carolId, "active") };
    const first = await api.send(people.owner, body, { repository: new Repository(lossy) });
    expect(first.status).toBe(500);
    expect(((await first.json()) as { error: string }).error).toBe(
      "Membership could not be loaded. Please try again.",
    );
    const retry = await api.send(people.owner, body);
    expect(retry.status).toBe(409);
    expect((await db.member(carolId))?.status).toBe("active");
    expect(await db.auditCount()).toBe(auditsBefore + 1);
    expect(await db.guardCount()).toBe(0);
  });

  it("member.add retried after the user reloads and re-enters the invite: clean 409, one record", async () => {
    await standardOrg(api);
    const db = inspect(fixture.db);
    const add = { type: "member.add", email: "dana@example.test", name: "Dana", levelId: "member" };
    const r0 = (await api.view(people.owner)).revision;
    expect((await api.command(people.owner, r0, add)).status).toBe(200);
    const r1 = (await api.view(people.owner)).revision;
    const again = await api.command(people.owner, r1, add);
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: string }).error).toMatch(/already exists/);
    const count = await fixture.db
      .prepare("SELECT COUNT(*) AS n FROM members WHERE email = 'dana@example.test'")
      .first("n");
    expect(count).toBe(1);
    expect(await db.guardCount()).toBe(0);
  });
});

describe("scenario 7: one global revision for the whole organization", () => {
  it("a member's own profile.update invalidates an admin's unrelated edit (admin gets 409)", async () => {
    const { carolId, beaId } = await standardOrg(api);
    const adminView = await api.view(people.owner); // admin opens the editor for Carol
    const own = await api.command(people.bea, adminView.revision, {
      type: "profile.update",
      name: "Bea Example",
      title: "Analyst",
    });
    expect(own.status).toBe(200);
    const adminSave = await api.command(
      people.owner,
      adminView.revision,
      memberUpdate(carolId, "active"),
    );
    expect(adminSave.status).toBe(409);
    expect((await inspect(fixture.db).member(carolId))?.status).toBe("pending");
    expect((await inspect(fixture.db).member(beaId))?.name).toBe("Bea Example");
  });

  it("a brand-new person's first sign-in (join) also invalidates the admin's open form", async () => {
    const { carolId } = await standardOrg(api);
    const adminView = await api.view(people.owner);
    expect((await api.join(people.dan)).status).toBe(200);
    expect(
      (await api.command(people.owner, adminView.revision, memberUpdate(carolId, "active"))).status,
    ).toBe(409);
  });

  it("characterization: an unchanged profile save still bumps the revision and writes an audit row", async () => {
    await standardOrg(api);
    const db = inspect(fixture.db);
    const v = await api.view(people.bea);
    const same = { type: "profile.update", name: "Bea", title: "Analyst" };
    const before = { revision: await db.revision(), audits: await db.auditCount() };
    // First save changes the profile; the second, identical save is the no-op under test.
    expect((await api.command(people.bea, v.revision, same)).status).toBe(200);
    const mid = { revision: await db.revision(), audits: await db.auditCount() };
    expect((await api.command(people.bea, mid.revision, same)).status).toBe(200);
    const after = { revision: await db.revision(), audits: await db.auditCount() };
    expect(mid).toEqual({ revision: before.revision + 1, audits: before.audits + 1 });
    // Observed: the no-op save is not detected, so it still contends with every admin.
    expect(after).toEqual({ revision: mid.revision + 1, audits: mid.audits + 1 });
    const last = (await db.audits()).at(-1);
    expect(last?.before).toEqual(last?.after);
  });
});
