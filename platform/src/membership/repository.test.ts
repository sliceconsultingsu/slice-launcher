import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { database, migrate, reset } from "../../tests/database";
import { Repository } from "./repository";
import { applyCommand, enroll } from "./domain";
import { createSession } from "./session";
let fixture: Awaited<ReturnType<typeof database>>;
beforeAll(async () => {
  fixture = await database();
  await migrate(fixture.db);
}, 30_000);
beforeEach(async () => {
  await reset(fixture.db);
});
afterAll(async () => {
  await fixture?.runtime.dispose();
});
async function setup() {
  const { db } = fixture;
  const repo = new Repository(db);
  const initial = await repo.load();
  const first = enroll(
    initial,
    { subject: "owner", email: "owner@example.test", emailManaged: true },
    { id: "owner-member", now: new Date().toISOString() },
  );
  if (!first.audit) throw new Error("Expected enrollment");
  await repo.commit(initial, { ...first, audit: first.audit });
  return { repo, db };
}
it("persists members and their audit record together", async () => {
  const { repo } = await setup();
  const state = await repo.load();
  expect(state.ownerClaimed).toBe(true);
  expect(state.members[0].owner).toBe(true);
  expect(await repo.history()).toHaveLength(1);
});
it("rejects stale mutations and rolls back every write and audit", async () => {
  const { repo, db } = await setup();
  const before = await repo.load();
  const first = applyCommand(
    before,
    "owner",
    { type: "level.save", name: "One", permissions: [] },
    { id: "one", now: "now" },
  );
  const second = applyCommand(
    before,
    "owner",
    { type: "level.save", name: "Two", permissions: [] },
    { id: "two", now: "now" },
  );
  await repo.commit(before, first);
  await expect(repo.commit(before, second)).rejects.toMatchObject({ status: 409 });
  expect((await repo.load()).levels.map((r) => r.name)).toEqual(["Member", "One"]);
  expect(await repo.history()).toHaveLength(2);
  expect(await db.prepare("SELECT COUNT(*) as count FROM mutation_guard").first("count")).toBe(0);
});

it("rolls back earlier writes when an audit insert fails later in the transaction", async () => {
  const { repo } = await setup();
  const before = await repo.load();
  const history = await repo.history();
  const change = applyCommand(
    before,
    "owner",
    { type: "profile.update", name: "Should roll back", title: "" },
    { id: history[0].id, now: "now" },
  );
  await expect(repo.commit(before, change)).rejects.toThrow();
  expect(await repo.load()).toEqual(before);
  expect(await repo.history()).toEqual(history);
});

it("removing a member deletes their record and sessions, and keeps everyone else's", async () => {
  const { repo, db } = await setup();
  const person = { subject: "person", email: "person@example.test", emailManaged: true };
  const owner = { subject: "owner", email: "owner@example.test", emailManaged: true };
  const joining = await repo.load();
  const joined = enroll(joining, person, { id: "person-member", now: new Date().toISOString() });
  if (!joined.audit) throw new Error("Expected enrollment");
  await repo.commit(joining, { ...joined, audit: joined.audit });
  await createSession(db, person, "test");
  await createSession(db, person, "test");
  await createSession(db, owner, "test");

  const before = await repo.load();
  await repo.commit(
    before,
    applyCommand(
      before,
      "owner",
      { type: "member.remove", id: "person-member" },
      { id: "removal", now: new Date().toISOString() },
    ),
  );

  const after = await repo.load();
  expect(after.members.map((m) => m.email)).toEqual(["owner@example.test"]);
  expect(after.revision).toBe(before.revision + 1);
  const sessions = await db.prepare("SELECT subject FROM sessions").all();
  const subjects = sessions.results.map((row: Record<string, unknown>) => row.subject);
  expect(subjects).not.toContain("person");
  expect(subjects).toContain("owner");
  expect((await repo.history())[0]).toMatchObject({ action: "member.remove", after: null });
});

it("removes an invited person who never signed in", async () => {
  const { repo, db } = await setup();
  const owner = { subject: "owner", email: "owner@example.test", emailManaged: true };
  await createSession(db, owner, "test");
  const before = await repo.load();
  const invited = applyCommand(
    before,
    "owner",
    { type: "member.add", email: "invited@example.test", name: "Invited", levelId: "member" },
    { id: "invited-member", now: new Date().toISOString() },
  );
  await repo.commit(before, invited);
  const listed = await repo.load();
  expect(listed.members).toHaveLength(2);
  const sessions = () => db.prepare("SELECT COUNT(*) as count FROM sessions").first("count");
  const sessionsBefore = await sessions();
  await repo.commit(
    listed,
    applyCommand(
      listed,
      "owner",
      { type: "member.remove", id: "invited-member" },
      { id: "removal", now: new Date().toISOString() },
    ),
  );
  expect((await repo.load()).members.map((m) => m.email)).toEqual(["owner@example.test"]);
  expect(await sessions(), "nobody else is signed out").toBe(sessionsBefore);
});
