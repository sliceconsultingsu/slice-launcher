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
      applyCommand(state, subject, command, {
        id: crypto.randomUUID(),
        now: "2026-11-19T10:00:00Z",
      }),
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
      server: false,
    });
    const first = await repository.version("notes", 1);
    expect(first!.store).toMatch(/^[0-9a-f-]{36}$/);
    expect(files.keys()).toEqual([
      `notes/${first!.store}/app.js`,
      `notes/${first!.store}/index.html`,
    ]);
    expect(first).toMatchObject({
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

  it("keeps the winner's files when two people publish at the same moment", async () => {
    const { repository, files, save } = await setup();
    const apps = new MemberApps({ repository, files, origin: "https://slice.example" });
    await apps.create(who("ana"), notes);
    await save("ana-sub", {
      type: "app.update",
      id: "notes",
      visibility: "private",
      managers: ["ana-member", "max-member"],
      people: [],
    });
    // Ana's publish is held just before her files are stored; Max's whole publish happens first.
    let held = false;
    const slow = new MemberApps({
      repository,
      origin: "https://slice.example",
      files: {
        get: files.get,
        async put(appId, store, list) {
          if (!held) {
            held = true;
            await apps.publish(
              who("max"),
              "notes",
              bundle({ files: [{ path: "index.html", text: "from Max" }] }),
            );
          }
          await files.put(appId, store, list);
        },
      },
    });
    expect(
      await status(() =>
        slow.publish(
          who("ana"),
          "notes",
          bundle({
            files: [
              { path: "index.html", text: "from Ana" },
              { path: "extra.js", text: "1" },
            ],
          }),
        ),
      ),
    ).toBe(409);
    const live = await repository.version("notes", 1);
    expect(live).toMatchObject({ publishedBy: "max-member", files: [{ path: "index.html" }] });
    const served = await files.get("notes", live!.store, "index.html");
    expect(new TextDecoder().decode(served!.body)).toBe("from Max");
    expect(await files.get("notes", live!.store, "extra.js")).toBeNull();
  });

  it("refuses someone who is not an active member, whatever they ask", async () => {
    const { apps } = await setup();
    expect(await status(() => apps.create(who("pia"), notes))).toBe(403);
    expect(await status(() => apps.list(who("pia")))).toBe(403);
    expect(await status(() => apps.list(who("nobody")))).toBe(403);
    expect(await status(() => apps.status(who("pia"), "notes"))).toBe(403);
    // A session whose email no longer matches the member is refused too.
    expect(await status(() => apps.list({ subject: "ana-sub", email: "other@example.test" }))).toBe(
      403,
    );
  });
});

describe("publishing server code", () => {
  const code = "export default { fetch() { return new Response('hi') } }";
  const withServer = (extra: Record<string, unknown> = {}) =>
    bundle({
      files: [
        { path: "index.html", text: page },
        { path: "worker.js", text: code },
      ],
      ...extra,
    });
  /** A stand-in for Cloudflare that records what the launcher asked of it. */
  function cloud(options: { failUpload?: boolean } = {}) {
    const calls: string[] = [];
    return {
      calls,
      ensureDatabase: async (appId: string) => {
        calls.push(`database ${appId}`);
        return `db-for-${appId}`;
      },
      uploadServer: async (script: string, source: string, databaseId: string, appId: string) => {
        calls.push(`upload ${script} ${databaseId} ${appId} ${source === code}`);
        if (options.failUpload)
          throw Object.assign(new Error("The app's server code could not be uploaded."), {
            status: 502,
          });
      },
    };
  }

  it("uploads the code as its own Worker with the app's own database, and records both", async () => {
    const { repository, files } = await setup();
    const fake = cloud();
    const apps = new MemberApps({
      repository,
      files,
      origin: "https://slice.example",
      cloud: fake,
    });
    await apps.create(who("ana"), notes);
    expect(await apps.publish(who("ana"), "notes", withServer())).toMatchObject({
      version: 1,
      live: true,
      files: 1,
      server: true,
    });
    const record = await repository.version("notes", 1);
    expect(record!.server!.script).toMatch(/^notes-[0-9a-f]{16}$/);
    expect(record!.files.map((file) => file.path)).toEqual(["index.html"]);
    expect(fake.calls).toEqual([
      "database notes",
      `upload ${record!.server!.script} db-for-notes notes true`,
    ]);
    expect((await repository.load()).memberApps).toMatchObject([{ database: "db-for-notes" }]);
    // The code is kept with the version, under a key the launcher never serves.
    const kept = await files.get("notes", record!.store, "__server/worker.js");
    expect(new TextDecoder().decode(kept!.body)).toBe(code);
  });

  it("reuses the app's database and gives every publish its own Worker", async () => {
    const { repository, files } = await setup();
    const fake = cloud();
    const apps = new MemberApps({
      repository,
      files,
      origin: "https://slice.example",
      cloud: fake,
    });
    await apps.create(who("ana"), notes);
    await apps.publish(who("ana"), "notes", withServer());
    await apps.publish(who("ana"), "notes", withServer());
    expect(fake.calls.filter((call) => call.startsWith("database"))).toHaveLength(1);
    const scripts = [1, 2].map(async (n) => (await repository.version("notes", n))!.server!.script);
    const [first, second] = await Promise.all(scripts);
    expect(first).not.toBe(second);
  });

  it("records no server for a version published without worker.js", async () => {
    const { repository, files } = await setup();
    const apps = new MemberApps({
      repository,
      files,
      origin: "https://slice.example",
      cloud: cloud(),
    });
    await apps.create(who("ana"), notes);
    await apps.publish(who("ana"), "notes", withServer());
    expect(await apps.publish(who("ana"), "notes", bundle())).toMatchObject({ server: false });
    expect((await repository.version("notes", 2))!.server).toBeNull();
    expect((await repository.load()).memberApps).toMatchObject([{ database: "db-for-notes" }]);
  });

  it("refuses server code while it is switched off, saying so", async () => {
    const { apps, files, repository } = await setup();
    await apps.create(who("ana"), notes);
    await expect(apps.publish(who("ana"), "notes", withServer())).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/not switched on/),
    });
    expect(files.keys()).toEqual([]);
    expect((await repository.load()).memberApps).toMatchObject([{ latest: 0 }]);
  });

  it("asks nothing of Cloudflare for someone who does not run the app", async () => {
    const { repository, files } = await setup();
    const fake = cloud();
    const apps = new MemberApps({
      repository,
      files,
      origin: "https://slice.example",
      cloud: fake,
    });
    await apps.create(who("ana"), notes);
    expect(await status(() => apps.publish(who("max"), "notes", withServer()))).toBe(403);
    expect(fake.calls).toEqual([]);
  });

  it("saves nothing when Cloudflare refuses the code, and keeps the database for next time", async () => {
    const { repository, files } = await setup();
    const fake = cloud({ failUpload: true });
    const apps = new MemberApps({
      repository,
      files,
      origin: "https://slice.example",
      cloud: fake,
    });
    await apps.create(who("ana"), notes);
    await expect(apps.publish(who("ana"), "notes", withServer())).rejects.toThrow(
      "could not be uploaded",
    );
    expect((await repository.load()).memberApps).toMatchObject([{ latest: 0, live: null }]);
    expect(files.keys()).toEqual([]);
  });
});

describe("keeping a runaway AI from filling the launcher", () => {
  it("stops a member at 30 publishes in an hour", async () => {
    const { apps, repository } = await setup();
    await apps.create(who("ana"), notes);
    // 29 earlier publishes in the last hour, recorded the way the launcher records them.
    const at = new Date(Date.now() - 60_000).toISOString();
    await fixture.db.batch(
      Array.from({ length: 29 }, (_, n) =>
        fixture.db.prepare("INSERT INTO access_audit(id, at, document) VALUES (?, ?, ?)").bind(
          `earlier-${n}`,
          at,
          JSON.stringify({
            id: `earlier-${n}`,
            at,
            actorId: "ana-member",
            action: "memberapp.publish",
          }),
        ),
      ),
    );
    expect(await status(() => apps.publish(who("ana"), "notes", bundle()))).toBeUndefined();
    expect(await status(() => apps.publish(who("ana"), "notes", bundle()))).toBe(429);
    expect((await repository.load()).memberApps).toMatchObject([{ latest: 1 }]);
    // Someone else is not held back by Ana's publishing.
    await apps.create(who("max"), { ...notes, id: "ledger" });
    expect(await status(() => apps.publish(who("max"), "ledger", bundle()))).toBeUndefined();
  });

  it("stops a member at 10 new apps in a day, however many they deleted", async () => {
    const { apps, save } = await setup();
    for (const round of [1, 2]) {
      for (const n of [1, 2, 3, 4, 5])
        await apps.create(who("ana"), { ...notes, id: `ana-${round}-${n}` });
      for (const n of [1, 2, 3, 4, 5])
        await save("ana-sub", { type: "memberapp.delete", id: `ana-${round}-${n}` });
    }
    expect(await status(() => apps.create(who("ana"), { ...notes, id: "ana-3-1" }))).toBe(429);
    expect(await status(() => apps.create(who("max"), { ...notes, id: "max-1" }))).toBeUndefined();
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
