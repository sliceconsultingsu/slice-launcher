import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { database, migrate, reset } from "../../tests/database";
import { memoryFiles } from "../../tests/member-apps/memory-files";
import { applyCommand, enroll } from "../membership/domain";
import { Repository } from "../membership/repository";
import { MemberApps } from "./service";
import { uploadRequest } from "./upload-route";
import { startUpload } from "./uploads";

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
const bundle = (extra: Record<string, unknown> = {}) => ({
  name: "Notes",
  description: "Shared notes.",
  guide: "# Notes",
  files: [{ path: "index.html", text: "<p>notes</p>" }],
  ...extra,
});
/** Ana runs "notes" and Max helps run it; nothing is published yet. */
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
  for (const name of ["owner", "ana", "max"]) {
    const state = await repository.load();
    const joined = enroll(
      state,
      { ...who(name), emailManaged: true },
      { id: `${name}-member`, now: "2026-11-19T09:00:00Z" },
    );
    if (joined.audit) await repository.commit(state, { ...joined, audit: joined.audit });
    if (name !== "owner")
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
  const files = memoryFiles();
  const service = new MemberApps({
    repository,
    files,
    origin: "https://slice.example",
    startUpload: (identity, appId, preview) => startUpload(fixture.db, identity, appId, preview),
  });
  await service.create(who("ana"), { id: "notes", name: "Notes", description: "Shared notes." });
  await save("ana-sub", {
    type: "app.update",
    id: "notes",
    visibility: "private",
    managers: ["ana-member", "max-member"],
    people: [],
  });
  const send = (
    token: string,
    body: unknown,
    init: { method?: string; service?: MemberApps | null } = {},
  ) =>
    uploadRequest(
      new Request(`https://slice.example/api/app-upload/${token}`, {
        method: init.method ?? "POST",
        headers: { "Content-Type": "application/json" },
        body:
          init.method === "GET"
            ? undefined
            : typeof body === "string"
              ? body
              : JSON.stringify(body),
      }),
      token,
      { db: fixture.db, service: init.service === null ? undefined : (init.service ?? service) },
    );
  return { repository, files, service, save, send };
}

describe("sending an app's files to a one-time upload address", () => {
  it("gives the member's AI an address for an app they run", async () => {
    const { service } = await setup();
    const given = await service.upload(who("ana"), "notes", { preview: false });
    expect(given.address).toMatch(/^https:\/\/slice\.example\/api\/app-upload\/[\w-]{43}$/);
    expect(given).toMatchObject({ minutes: 10, files: 100, megabytes: 5 });
    await expect(service.upload(who("owner"), "nowhere", { preview: false })).rejects.toMatchObject(
      {
        status: 404,
      },
    );
  });

  it("says so when upload addresses are not available", async () => {
    const { repository, files } = await setup();
    const without = new MemberApps({ repository, files, origin: "https://slice.example" });
    await expect(without.upload(who("ana"), "notes")).rejects.toMatchObject({ status: 503 });
  });

  it("gives no address to someone who does not run the app", async () => {
    const { service, save } = await setup();
    await save("ana-sub", {
      type: "app.update",
      id: "notes",
      visibility: "private",
      managers: ["ana-member"],
      people: [{ memberId: "max-member", powers: [] }],
    });
    await expect(service.upload(who("max"), "notes", { preview: false })).rejects.toMatchObject({
      status: 403,
    });
    expect(await fixture.db.prepare("SELECT COUNT(*) AS n FROM app_uploads").first()).toEqual({
      n: 0,
    });
  });

  it("publishes what is sent, as the member, and works once", async () => {
    const { service, send, repository, files } = await setup();
    const token = (await service.upload(who("ana"), "notes", { preview: false })).address
      .split("/")
      .pop()!;
    const response = await send(token, bundle());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ id: "notes", version: 1, live: true });
    expect((await repository.version("notes", 1))!.publishedBy).toBe("ana-member");
    expect(files.keys()).toHaveLength(1);
    const again = await send(token, bundle());
    expect(again.status).toBe(404);
    expect(((await again.json()) as { error: string }).error).toMatch(/used or has expired/);
    expect((await repository.load()).memberApps).toMatchObject([{ latest: 1 }]);
  });

  it("publishes a preview when the address was asked for as one", async () => {
    const { service, send, repository } = await setup();
    const token = (await service.upload(who("ana"), "notes", { preview: true })).address
      .split("/")
      .pop()!;
    expect(await (await send(token, bundle())).json()).toMatchObject({
      live: false,
      preview: true,
    });
    expect((await repository.load()).memberApps).toMatchObject([{ live: null, preview: 1 }]);
  });

  it("takes an app too large for a tool call", async () => {
    const { service, send } = await setup();
    const token = (await service.upload(who("ana"), "notes", { preview: false })).address
      .split("/")
      .pop()!;
    const big = "x".repeat(1500 * 1024);
    const response = await send(
      token,
      bundle({
        files: [
          { path: "index.html", text: "<p>notes</p>" },
          { path: "big.js", text: big },
        ],
      }),
    );
    expect(await response.json()).toMatchObject({ version: 1, files: 2 });
  });

  it("publishes nothing if the member was suspended, or stopped running the app, after asking", async () => {
    const { service, send, save, repository } = await setup();
    const forMax = (await service.upload(who("max"), "notes", { preview: false })).address
      .split("/")
      .pop()!;
    await save("ana-sub", {
      type: "app.update",
      id: "notes",
      visibility: "private",
      managers: ["ana-member"],
      people: [{ memberId: "max-member", powers: [] }],
    });
    expect((await send(forMax, bundle())).status).toBe(403);
    const forAna = (await service.upload(who("ana"), "notes", { preview: false })).address
      .split("/")
      .pop()!;
    await save("owner-sub", {
      type: "member.update",
      id: "ana-member",
      status: "suspended",
      levelId: "member",
      allow: [],
      deny: [],
      owner: false,
    });
    expect((await send(forAna, bundle())).status).toBe(403);
    expect((await repository.load()).memberApps).toMatchObject([{ latest: 0, live: null }]);
  });

  it("says what is wrong with what was sent", async () => {
    const { service, send } = await setup();
    const token = async () =>
      (await service.upload(who("ana"), "notes", { preview: false })).address.split("/").pop()!;
    const notJson = await send(await token(), "this is not JSON");
    expect(notJson.status).toBe(400);
    const noIndex = await send(await token(), bundle({ files: [{ path: "a.html", text: "x" }] }));
    expect(noIndex.status).toBe(400);
    expect(((await noIndex.json()) as { error: string }).error).toMatch(/index\.html/);
  });

  it("refuses more than 8 MB without using the address up", async () => {
    const { service, send } = await setup();
    const token = (await service.upload(who("ana"), "notes", { preview: false })).address
      .split("/")
      .pop()!;
    expect((await send(token, "x".repeat(8 * 1024 * 1024 + 1))).status).toBe(413);
    expect((await send(token, bundle())).status).toBe(200);
  });

  it("answers 404 to a made-up address, 405 to anything but a POST, and 404 while member apps are off", async () => {
    const { service, send } = await setup();
    expect((await send("x".repeat(43), bundle())).status).toBe(404);
    const token = (await service.upload(who("ana"), "notes", { preview: false })).address
      .split("/")
      .pop()!;
    expect((await send(token, null, { method: "GET" })).status).toBe(405);
    expect((await send(token, bundle(), { service: null })).status).toBe(404);
    expect((await send(token, bundle())).status).toBe(200);
  });
});
