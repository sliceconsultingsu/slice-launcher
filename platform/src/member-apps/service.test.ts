import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { database, migrate, reset } from "../../tests/database";
import { memoryFiles } from "../../tests/member-apps/memory-files";
import { applyCommand, enroll } from "../membership/domain";
import { Repository } from "../membership/repository";
import { MemberApps } from "./service";

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

const who = (name: string) => ({ subject: `${name}-sub`, email: `${name}@example.test` });
const page = "<!doctype html><title>Notes</title>";
const bundle = (overrides: Record<string, unknown> = {}) => ({
  name: "Team notes",
  description: "Notes the team shares.",
  guide: "# Team notes",
  files: [
    { path: "index.html", text: page },
    { path: "app.js", text: "1" },
  ],
  ...overrides,
});
const notes = { id: "notes", name: "Team notes", description: "Notes the team shares." };

/** An owner and active members Ana and Max, each with a name; Pia has only asked to join. */
async function setup() {
  const repository = new Repository(fixture.db);
  const save = async (subject: string, command: unknown) => {
    const state = await repository.load();
    await repository.commit(
      state,
      applyCommand(state, subject, command, { id: crypto.randomUUID(), now: "2026-11-19T10:00:00Z" }),
    );
  };
  for (const name of ["owner", "ana", "max", "pia"]) {
    const state = await repository.load();
    const joined = enroll(
      state,
      { ...who(name), emailManaged: true },
      { id: `${name}-member`, now: "2026-11-19T09:00:00Z" },
    );
    if (joined.audit) await repository.commit(state, { ...joined, audit: joined.audit });
    if (name === "ana" || name === "max")
      await save("owner-sub", {
        type: "member.update",
        id: `${name}-member`,
        status: "active",
        levelId: "member",
        allow: [],
        deny: [],
        owner: false,
      });
    if (name !== "pia")
      await save(`${name}-sub`, {
        type: "profile.update",
        name: name[0].toUpperCase() + name.slice(1),
        title: "",
      });
  }
  const files = memoryFiles();
  const apps = new MemberApps({ repository, files, origin: "https://slice.example" });
  return { repository, files, apps, save };
}
async function status(run: () => Promise<unknown>): Promise<number | undefined> {
  try {
    await run();
  } catch (error) {
    return (error as { status?: number }).status;
  }
  return undefined;
}

describe("creating and publishing through the launcher", () => {
  it("creates an app at its own address, run by the person who asked", async () => {
    const { apps, repository } = await setup();
    expect(await apps.create(who("ana"), notes)).toEqual({
      id: "notes",
      name: "Team notes",
      address: "https://notes.slice.example",
      page: "https://slice.example/about/notes",
      live: false,
    });
    const state = await repository.load();
    expect(state.memberApps).toMatchObject([{ id: "notes", createdBy: "ana-member" }]);
    expect(state.apps).toMatchObject([{ id: "notes", managers: ["ana-member"] }]);
  });

  it("publishes a version: files stored, record kept, live at once", async () => {
    const { apps, files, repository } = await setup();
    await apps.create(who("ana"), notes);
    expect(await apps.publish(who("ana"), "notes", bundle())).toEqual({
      id: "notes",
      version: 1,
      address: "https://notes.slice.example",
      live: true,
      files: 2,
    });
    expect(files.keys()).toEqual(["notes/1/app.js", "notes/1/index.html"]);
    expect(await repository.version("notes", 1)).toMatchObject({
      appId: "notes",
      version: 1,
      publishedBy: "ana-member",
      guide: "# Team notes",
      files: [
        { path: "index.html", type: "text/html; charset=utf-8", size: page.length },
        { path: "app.js", type: "text/javascript; charset=utf-8", size: 1 },
      ],
    });
    expect((await repository.load()).memberApps).toMatchObject([{ live: 1, latest: 1 }]);
    expect((await apps.publish(who("ana"), "notes", bundle())).version).toBe(2);
    expect(files.keys()).toHaveLength(4);
  });

  it("stores nothing when someone who does not run the app tries to publish", async () => {
    const { apps, files, repository } = await setup();
    await apps.create(who("ana"), notes);
    expect(await status(() => apps.publish(who("max"), "notes", bundle()))).toBe(403);
    expect(await status(() => apps.publish(who("max"), "nowhere", bundle()))).toBe(404);
    expect(files.keys()).toEqual([]);
    expect((await repository.load()).memberApps).toMatchObject([{ live: null, latest: 0 }]);
  });

  it("stores nothing when the bundle is refused", async () => {
    const { apps, files } = await setup();
    await apps.create(who("ana"), notes);
    expect(await status(() => apps.publish(who("ana"), "notes", bundle({ files: [] })))).toBe(400);
    expect(files.keys()).toEqual([]);
  });

  it("puts no version live if its files could not be stored", async () => {
    const { repository } = await setup();
    const failing = {
      put: async () => {
        throw new Error("store unavailable");
      },
      get: async () => null,
    };
    const apps = new MemberApps({ repository, files: failing, origin: "https://slice.example" });
    await apps.create(who("ana"), notes);
    await expect(apps.publish(who("ana"), "notes", bundle())).rejects.toThrow("store unavailable");
    expect((await repository.load()).memberApps).toMatchObject([{ live: null, latest: 0 }]);
    expect(await repository.versions("notes")).toEqual([]);
  });

  it("refuses someone who is not an active member, whatever they ask", async () => {
    const { apps } = await setup();
    expect(await status(() => apps.create(who("pia"), notes))).toBe(403);
    expect(await status(() => apps.list(who("pia")))).toBe(403);
    expect(await status(() => apps.list(who("nobody")))).toBe(403);
    expect(await status(() => apps.status(who("pia"), "notes"))).toBe(403);
    // A session whose email no longer matches the member is refused too.
    expect(
      await status(() => apps.list({ subject: "ana-sub", email: "other@example.test" })),
    ).toBe(403);
  });
});

describe("asking about apps", () => {
  it("tells the people who run an app where it stands", async () => {
    const { apps, save } = await setup();
    await apps.create(who("ana"), notes);
    expect(await apps.status(who("ana"), "notes")).toEqual({
      id: "notes",
      name: "Team notes",
      address: "https://notes.slice.example",
      page: "https://slice.example/about/notes",
      live: false,
      liveVersion: null,
      latestVersion: 0,
      visibility: "private",
      waitingForOwner: false,
      people: 0,
      lastPublished: null,
    });
    await apps.publish(who("ana"), "notes", bundle());
    await save("ana-sub", {
      type: "app.update",
      id: "notes",
      visibility: "public",
      managers: ["ana-member"],
      people: [{ memberId: "max-member", powers: [] }],
    });
    expect(await apps.status(who("ana"), "notes")).toMatchObject({
      live: true,
      liveVersion: 1,
      latestVersion: 1,
      visibility: "private",
      waitingForOwner: true,
      people: 1,
      lastPublished: { version: 1, by: "Ana" },
    });
    // An owner runs every app; someone merely on the app does not.
    expect(await status(() => apps.status(who("owner"), "notes"))).toBeUndefined();
    expect(await status(() => apps.status(who("max"), "notes"))).toBe(403);
    expect(await status(() => apps.status(who("ana"), "nowhere"))).toBe(404);
    expect(await status(() => apps.status(who("owner"), "alumni"))).toBe(404);
  });

  it("lists the apps a person runs and how many more they can create", async () => {
    const { apps } = await setup();
    await apps.create(who("ana"), notes);
    await apps.create(who("max"), { ...notes, id: "ledger", name: "Ledger" });
    expect(await apps.list(who("ana"))).toEqual({
      apps: [
        {
          id: "notes",
          name: "Team notes",
          address: "https://notes.slice.example",
          page: "https://slice.example/about/notes",
          live: false,
        },
      ],
      canCreate: 4,
    });
    const all = await apps.list(who("owner"));
    expect(all.apps.map((app) => app.id)).toEqual(["ledger", "notes"]);
    expect(all.canCreate).toBeNull();
  });
});
