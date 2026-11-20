// Scenario 10 (application side): what the optimistic-concurrency revision does after a
// point-in-time restore. Time Travel itself is remote-only; the restore is simulated by copying
// every row of the membership tables and writing them back.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  client,
  inspect,
  memberUpdate,
  openFixture,
  people,
  reset,
  signer,
  standardOrg,
} from "./harness";
import type { Client, Db, Fixture, Signer } from "./harness";

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

const tables = ["organization", "access_levels", "members", "access_audit", "mutation_guard"];
async function backup(db: Db) {
  const copy: Record<string, Record<string, unknown>[]> = {};
  for (const table of tables)
    copy[table] = (
      await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all<Record<string, unknown>>()
    ).results;
  return copy;
}
async function restore(db: Db, copy: Awaited<ReturnType<typeof backup>>) {
  const statements = tables.map((table) => db.prepare(`DELETE FROM ${table}`));
  for (const table of tables)
    for (const row of copy[table]) {
      const columns = Object.keys(row);
      statements.push(
        db
          .prepare(
            `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
          )
          .bind(...columns.map((column) => row[column])),
      );
    }
  await db.batch(statements);
}

describe("scenario 10: revision numbers after a point-in-time restore", () => {
  it.fails(
    "known defect (2026-10-16): a tab opened on discarded post-backup state is rejected after restore + new edits",
    async () => {
      const { carolId, revision } = await standardOrg(api);
      const point = await backup(fixture.db); // recovery point at `revision`, Carol pending
      // After the recovery point: the owner activates Carol; Bea opens the editor on that state.
      expect(
        (await api.command(people.owner, revision, memberUpdate(carolId, "active"))).status,
      ).toBe(200);
      const beaTab = await api.view(people.bea);
      expect(beaTab.revision).toBe(revision + 1);
      // Incident: the database is restored to the recovery point (revision goes backwards).
      await restore(fixture.db, point);
      expect(await inspect(fixture.db).revision()).toBe(revision);
      // After reopening, the owner decides Carol must be suspended: revision is again revision + 1.
      expect(
        (await api.command(people.owner, revision, memberUpdate(carolId, "suspended"))).status,
      ).toBe(200);
      // Bea's stale tab (which never saw the suspension) saves Carol as active.
      const stale = await api.command(people.bea, beaTab.revision, memberUpdate(carolId, "active"));
      console.info(
        `[eval] stale pre-restore tab after restore: HTTP ${stale.status}; carol now ${(await inspect(fixture.db).member(carolId))?.status}`,
      );
      expect(stale.status).toBe(409);
      expect((await inspect(fixture.db).member(carolId))?.status).toBe("suspended");
    },
  );

  it("mitigation check: bumping the revision past any pre-restore value makes the stale tab 409", async () => {
    const { carolId, revision } = await standardOrg(api);
    const point = await backup(fixture.db);
    expect(
      (await api.command(people.owner, revision, memberUpdate(carolId, "active"))).status,
    ).toBe(200);
    const beaTab = await api.view(people.bea);
    await restore(fixture.db, point);
    await fixture.db
      .prepare("UPDATE organization SET revision = revision + 1000 WHERE id = 'slice'")
      .run();
    const current = (await api.view(people.owner)).revision;
    expect(
      (await api.command(people.owner, current, memberUpdate(carolId, "suspended"))).status,
    ).toBe(200);
    expect(
      (await api.command(people.bea, beaTab.revision, memberUpdate(carolId, "active"))).status,
    ).toBe(409);
  });
});
