// Scenario 5: failed writes must leave no partial state, the revision unchanged and no guard row.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyCommand } from "../../src/membership/domain";
import { Repository } from "../../src/membership/repository";
import type { Member } from "../../src/membership/contracts";
import {
  client,
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

async function snapshot() {
  const repo = new Repository(fixture.db);
  const db = inspect(fixture.db);
  return {
    state: await repo.load(),
    audits: await db.audits(),
    guard: await db.guardCount(),
  };
}

/** Wraps db.batch so that commit batches (more than the 3 statements of load()) get one extra
 *  failing statement at `position(length)`. */
function injecting(position: (length: number) => number) {
  const failing = () =>
    fixture.db.prepare("INSERT INTO members(id, email, document) VALUES ('injected', NULL, '{}')");
  return new Repository({
    prepare: fixture.db.prepare.bind(fixture.db),
    batch: (async (statements: D1PreparedStatement[]) => {
      if (statements.length <= 3) return fixture.db.batch(statements);
      const copy = [...statements];
      copy.splice(position(copy.length), 0, failing());
      return fixture.db.batch(copy);
    }) as D1Database["batch"],
  });
}

describe("scenario 5: failure injected into the D1 batch", () => {
  for (const [label, position] of [
    ["mid-batch (after the guard insert, before row upserts)", () => 1],
    ["mid-batch (after row upserts, before the revision bump)", (n: number) => n - 3],
    ["end of batch (after the guard delete)", (n: number) => n],
  ] as const) {
    it(`${label}: HTTP 500, no partial state, revision unchanged, guard empty`, async () => {
      const { carolId, revision } = await standardOrg(api);
      const before = await snapshot();
      const response = await api.send(
        people.owner,
        { revision, command: memberUpdate(carolId, "active") },
        { repository: injecting(position) },
      );
      expect(response.status).toBe(500);
      const after = await snapshot();
      expect(after.state).toEqual(before.state);
      expect(after.audits).toEqual(before.audits);
      expect(after.guard).toBe(0);
      // The organization keeps working: the same save succeeds without the fault.
      expect(
        (await api.command(people.owner, revision, memberUpdate(carolId, "active"))).status,
      ).toBe(200);
      expect((await inspect(fixture.db).member(carolId))?.status).toBe("active");
    });
  }
});

describe("scenario 5: real constraint violations inside commit()", () => {
  it("UNIQUE(email) violation mid-batch after a level upsert already ran: full rollback", async () => {
    const { carolId } = await standardOrg(api);
    const repo = new Repository(fixture.db);
    const before = await snapshot();
    const mutation = applyCommand(
      before.state,
      subjectOf(people.owner),
      { type: "level.save", name: "Partners", permissions: ["members.read"] },
      { id: "audit-level-partners", now: new Date().toISOString() },
    );
    const carol = mutation.state.members.find((m) => m.id === carolId) as Member;
    mutation.state.members.push({ ...carol, id: "clone", subject: "clone-subject" });
    const failure = await repo.commit(before.state, mutation).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(String((failure as Error).message)).toMatch(/UNIQUE constraint failed: members.email/);
    expect((failure as { status?: number }).status).toBeUndefined(); // surfaces as HTTP 500
    const after = await snapshot();
    expect(after.state).toEqual(before.state);
    expect(after.state.levels.map((l) => l.name)).not.toContain("Partners");
    expect(after.audits).toEqual(before.audits);
    expect(after.guard).toBe(0);
  });

  it("duplicate audit id at the end of the batch: member change and revision bump roll back", async () => {
    const { carolId } = await standardOrg(api);
    const repo = new Repository(fixture.db);
    const before = await snapshot();
    const reused = before.audits[0].id;
    const mutation = applyCommand(
      before.state,
      subjectOf(people.owner),
      memberUpdate(carolId, "active"),
      { id: reused, now: new Date().toISOString() },
    );
    await expect(repo.commit(before.state, mutation)).rejects.toThrow(
      /UNIQUE constraint failed: access_audit.id/,
    );
    const after = await snapshot();
    expect(after.state).toEqual(before.state);
    expect((await inspect(fixture.db).member(carolId))?.status).toBe("pending");
    expect(after.audits).toEqual(before.audits);
    expect(after.guard).toBe(0);
  });
});
