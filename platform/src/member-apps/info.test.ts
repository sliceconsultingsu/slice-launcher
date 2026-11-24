import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { database, migrate, reset } from "../../tests/database";
import { memoryFiles } from "../../tests/member-apps/memory-files";
import { applyCommand, enroll } from "../membership/domain";
import { Repository } from "../membership/repository";
import { appInfo } from "./info";
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
const bundle = (guide: string) => ({
  name: "Notes",
  description: "Shared notes.",
  guide,
  files: [{ path: "index.html", text: "<p>notes</p>" }],
});
/** Ana runs "notes" with two published versions; Max is on it; Sam is not; Pia is pending. */
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
  for (const name of ["owner", "ana", "max", "sam", "pia"]) {
    const state = await repository.load();
    const joined = enroll(
      state,
      { ...who(name), emailManaged: true },
      { id: `${name}-member`, now: "2026-11-19T09:00:00Z" },
    );
    if (joined.audit) await repository.commit(state, { ...joined, audit: joined.audit });
    if (["ana", "max", "sam"].includes(name))
      await save("owner-sub", {
        type: "member.update",
        id: `${name}-member`,
        status: "active",
        levelId: "member",
        allow: [],
        deny: [],
        owner: false,
      });
  }
  await save("ana-sub", { type: "profile.update", name: "Ana", title: "" });
  const apps = new MemberApps({
    repository,
    files: memoryFiles(),
    origin: "https://slice.example",
  });
  await apps.create(who("ana"), { id: "notes", name: "Notes", description: "Shared notes." });
  await apps.publish(who("ana"), "notes", bundle("# First guide"));
  await apps.publish(who("ana"), "notes", bundle("# Second guide"));
  await save("ana-sub", {
    type: "app.update",
    id: "notes",
    visibility: "private",
    managers: ["ana-member"],
    people: [{ memberId: "max-member", powers: [] }],
  });
  return { repository, save };
}
async function status(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return (error as { status?: number }).status;
  }
  return undefined;
}

describe("what the app's page in the launcher shows", () => {
  it("gives the people who run the app its guide and its versions, newest first", async () => {
    const { repository } = await setup();
    expect(await appInfo(who("ana"), repository, "notes")).toEqual({
      guide: "# Second guide",
      versions: [
        { version: 2, at: expect.any(String), by: "Ana" },
        { version: 1, at: expect.any(String), by: "Ana" },
      ],
    });
    expect(await appInfo(who("owner"), repository, "notes")).toHaveProperty("versions");
  });

  it("gives someone on the app the live version's guide and nothing else", async () => {
    const { repository, save } = await setup();
    expect(await appInfo(who("max"), repository, "notes")).toEqual({ guide: "# Second guide" });
    await save("ana-sub", { type: "memberapp.live", id: "notes", version: 1 });
    expect(await appInfo(who("max"), repository, "notes")).toEqual({ guide: "# First guide" });
  });

  it("shows no guide to people on an offline app, and the latest to those who run it", async () => {
    const { repository, save } = await setup();
    await save("ana-sub", { type: "memberapp.live", id: "notes", version: null });
    expect(await appInfo(who("max"), repository, "notes")).toEqual({ guide: "" });
    expect(await appInfo(who("ana"), repository, "notes")).toMatchObject({
      guide: "# Second guide",
    });
  });

  it("answers the same for an app someone is not on as for one that does not exist", async () => {
    const { repository, save } = await setup();
    expect(await status(() => appInfo(who("sam"), repository, "notes"))).toBe(404);
    expect(await status(() => appInfo(who("sam"), repository, "nowhere"))).toBe(404);
    expect(await status(() => appInfo(who("ana"), repository, "alumni"))).toBe(404);
    await save("ana-sub", { type: "memberapp.delete", id: "notes" });
    expect(await status(() => appInfo(who("ana"), repository, "notes"))).toBe(404);
  });

  it("refuses someone who is not an active member", async () => {
    const { repository } = await setup();
    expect(await status(() => appInfo(who("pia"), repository, "notes"))).toBe(403);
    expect(await status(() => appInfo(who("stranger"), repository, "notes"))).toBe(403);
  });
});
