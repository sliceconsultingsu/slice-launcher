import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { database, migrate, reset } from "../../tests/database";
import { HISTORY_PAGE, Repository, type HistoryCursor } from "./repository";
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

it("ending a member's active status ends their sessions once, and nobody else's", async () => {
  const { repo, db } = await setup();
  const person = { subject: "person", email: "person@example.test", emailManaged: true };
  const owner = { subject: "owner", email: "owner@example.test", emailManaged: true };
  const joining = await repo.load();
  const joined = enroll(joining, person, { id: "person-member", now: new Date().toISOString() });
  if (!joined.audit) throw new Error("Expected enrollment");
  await repo.commit(joining, { ...joined, audit: joined.audit });
  const subjects = async () =>
    (await db.prepare("SELECT subject FROM sessions ORDER BY subject").all()).results.map(
      (row: Record<string, unknown>) => row.subject,
    );
  const update = async (status: "active" | "suspended" | "pending", id: string) => {
    const before = await repo.load();
    await repo.commit(
      before,
      applyCommand(
        before,
        "owner",
        {
          type: "member.update",
          id: "person-member",
          status,
          levelId: "member",
          allow: [],
          deny: [],
          owner: false,
        },
        { id, now: new Date().toISOString() },
      ),
    );
  };
  await db.prepare("DELETE FROM sessions").run();
  await createSession(db, owner, "test");
  await update("active", "approve");
  await createSession(db, person, "test");
  await createSession(db, person, "test");
  expect(await subjects()).toEqual(["owner", "person", "person"]);

  await update("suspended", "suspend");
  expect(await subjects()).toEqual(["owner"]);

  // Reinstated, they sign in again; an unrelated later change does not sign them out.
  await update("active", "reinstate");
  await createSession(db, person, "test");
  const before = await repo.load();
  await repo.commit(
    before,
    applyCommand(
      before,
      "owner",
      { type: "level.save", name: "Another level", permissions: [] },
      { id: "level", now: new Date().toISOString() },
    ),
  );
  expect(await subjects()).toEqual(["owner", "person"]);

  // Returning them to pending signs them out too. Saving a pending person again does not.
  await update("pending", "unapprove");
  expect(await subjects()).toEqual(["owner"]);
  await createSession(db, person, "test");
  await update("pending", "unapprove-again");
  expect(await subjects()).toEqual(["owner", "person"]);

  // Suspending someone who was never active signs them out as well.
  await update("suspended", "suspend-pending");
  expect(await subjects()).toEqual(["owner"]);
});

it("joining does not end the session a new person joined with", async () => {
  const { repo, db } = await setup();
  const person = { subject: "person", email: "person@example.test", emailManaged: true };
  await db.prepare("DELETE FROM sessions").run();
  await createSession(db, person, "test");
  const joining = await repo.load();
  const joined = enroll(joining, person, { id: "person-member", now: new Date().toISOString() });
  if (!joined.audit) throw new Error("Expected enrollment");
  await repo.commit(joining, { ...joined, audit: joined.audit });
  expect((await repo.load()).members.find((m) => m.subject === "person")?.status).toBe("pending");
  expect(await db.prepare("SELECT COUNT(*) AS count FROM sessions").first("count")).toBe(1);
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

it("pages through history newest first without repeating or skipping an entry", async () => {
  const { repo, db } = await setup();
  // 120 entries, several sharing a timestamp, so a page boundary can fall inside a tie.
  const at = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, Math.floor(i / 3))).toISOString();
  await db.batch(
    Array.from({ length: 120 }, (_, i) =>
      db.prepare("INSERT INTO access_audit(id, at, document) VALUES (?, ?, ?)").bind(
        `entry-${i}`,
        at(i),
        JSON.stringify({
          id: `entry-${i}`,
          at: at(i),
          actorId: "someone",
          action: i % 2 ? "profile.update" : "member.update",
          targetId: "someone",
          before: null,
          after: null,
        }),
      ),
    ),
  );
  const seen: string[] = [];
  let before: HistoryCursor | undefined;
  let pages = 0;
  do {
    const page = await repo.historyPage({ includeProfileEdits: true, before });
    expect(page.items.length).toBeLessThanOrEqual(HISTORY_PAGE);
    seen.push(...page.items.map((item) => item.id));
    before = page.next ?? undefined;
    pages += 1;
  } while (before);
  expect(pages).toBe(3);
  // 120 inserted here plus the owner's sign-in from setup.
  expect(seen).toHaveLength(121);
  expect(new Set(seen).size).toBe(121);
  expect(seen.slice(1, 4)).toEqual(["entry-119", "entry-118", "entry-117"]);

  const quiet = await repo.historyPage();
  expect(quiet.items).toHaveLength(HISTORY_PAGE);
  expect(quiet.items.some((item) => item.action === "profile.update")).toBe(false);
  const rest = await repo.historyPage({ before: quiet.next ?? undefined });
  expect(rest.items).toHaveLength(11);
  expect(rest.next).toBeNull();
});

it("counts one member's recent actions of one kind", async () => {
  const { repo, db } = await setup();
  const entry = (id: string, at: string, actorId: string, action: string) =>
    db
      .prepare("INSERT INTO access_audit(id, at, document) VALUES (?, ?, ?)")
      .bind(id, at, JSON.stringify({ id, at, actorId, action }));
  await db.batch([
    entry("a", "2026-01-02T00:00:00.000Z", "pat", "profile.update"),
    entry("b", "2026-01-02T01:00:00.000Z", "pat", "profile.update"),
    entry("c", "2026-01-01T00:00:00.000Z", "pat", "profile.update"),
    entry("d", "2026-01-02T02:00:00.000Z", "pat", "member.update"),
    entry("e", "2026-01-02T03:00:00.000Z", "sam", "profile.update"),
  ]);
  expect(await repo.actionsSince("pat", "profile.update", "2026-01-01T12:00:00.000Z")).toBe(2);
  expect(await repo.actionsSince("nobody", "profile.update", "2026-01-01T12:00:00.000Z")).toBe(0);
});

const appUpdate = (overrides: Record<string, unknown> = {}) => ({
  type: "app.update",
  id: "alumni",
  visibility: "private",
  managers: [],
  people: [],
  ...overrides,
});
it("keeps an app's settings across a save and reload", async () => {
  const { repo } = await setup();
  const before = await repo.load();
  expect(before.apps).toEqual([]);
  const saved = applyCommand(
    before,
    "owner",
    appUpdate({ visibility: "public", managers: ["owner-member"] }),
    { id: "app-one", now: "2026-11-18T12:00:00Z" },
  );
  await repo.commit(before, saved);
  const after = await repo.load();
  expect(after.apps).toEqual([
    { id: "alumni", visibility: "public", managers: ["owner-member"], people: [] },
  ]);
  expect((await repo.history()).filter((entry) => entry.action === "app.update")).toMatchObject([
    { id: "app-one", targetId: "alumni", before: null },
  ]);
});
it("writes an app's settings only when they change", async () => {
  const { repo, db } = await setup();
  let state = await repo.load();
  await repo.commit(
    state,
    applyCommand(state, "owner", appUpdate({ visibility: "public" }), { id: "a", now: "now" }),
  );
  // Mark the stored row; an unrelated save must leave it exactly as it is.
  await db.prepare("UPDATE app_settings SET document = json_set(document, '$.kept', 1)").run();
  state = await repo.load();
  await repo.commit(
    state,
    applyCommand(
      state,
      "owner",
      { type: "level.save", name: "Other", permissions: [] },
      { id: "b", now: "now" },
    ),
  );
  expect(
    await db.prepare("SELECT json_extract(document, '$.kept') AS kept FROM app_settings").first(),
  ).toEqual({ kept: 1 });
});
it("refuses the second of two saves made from the same starting point", async () => {
  const { repo } = await setup();
  const before = await repo.load();
  const first = applyCommand(before, "owner", appUpdate({ visibility: "public" }), {
    id: "first",
    now: "now",
  });
  const second = applyCommand(before, "owner", appUpdate({ managers: ["owner-member"] }), {
    id: "second",
    now: "now",
  });
  await repo.commit(before, first);
  await expect(repo.commit(before, second)).rejects.toMatchObject({ status: 409 });
  expect((await repo.load()).apps).toEqual([
    { id: "alumni", visibility: "public", managers: [], people: [] },
  ]);
});
