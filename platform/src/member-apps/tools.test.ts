import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { database, migrate, reset } from "../../tests/database";
import { memoryFiles } from "../../tests/member-apps/memory-files";
import { applyCommand, enroll } from "../membership/domain";
import { Repository } from "../membership/repository";
import { createMcpAdapter } from "../platform/mcp";
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
/** An owner and active members Ana and Max; Pia has only asked to join. */
async function setup(options: { memberApps?: boolean; server?: boolean } = {}) {
  const repository = new Repository(fixture.db);
  for (const name of ["owner", "ana", "max", "pia"]) {
    let state = await repository.load();
    const joined = enroll(
      state,
      { ...who(name), emailManaged: true },
      { id: `${name}-member`, now: "2026-11-19T09:00:00Z" },
    );
    if (joined.audit) await repository.commit(state, { ...joined, audit: joined.audit });
    if (name === "ana" || name === "max") {
      state = await repository.load();
      await repository.commit(
        state,
        applyCommand(
          state,
          "owner-sub",
          {
            type: "member.update",
            id: `${name}-member`,
            status: "active",
            levelId: "member",
            allow: [],
            deny: [],
            owner: false,
          },
          { id: crypto.randomUUID(), now: "2026-11-19T10:00:00Z" },
        ),
      );
    }
  }
  const files = memoryFiles();
  const memberApps = new MemberApps({
    repository,
    files,
    origin: "https://slice.example",
    ...(options.server
      ? { cloud: { ensureDatabase: async () => "db-1", uploadServer: async () => {} } }
      : {}),
  });
  const adapter = (name: string) =>
    createMcpAdapter({
      catalog: [],
      modules: new Map(),
      verify: async () => who(name),
      loadState: () => repository.load(),
      ...(options.memberApps === false ? {} : { memberApps }),
    });
  let next = 1;
  const send = async (name: string, method: string, params: unknown, raw?: string) => {
    const response = await adapter(name)(
      new Request("https://slice.example/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2025-11-25",
        },
        body: raw ?? JSON.stringify({ jsonrpc: "2.0", id: next++, method, params }),
      }),
    );
    return { status: response.status, body: (await response.json()) as Reply };
  };
  const call = async (name: string, tool: string, input: unknown) =>
    (await send(name, "tools/call", { name: tool, arguments: input })).body.result!;
  return { repository, files, send, call };
}
type Reply = {
  result?: {
    tools?: { name: string; description: string }[];
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    content?: { type: string; text: string }[];
  };
  error?: unknown;
};
const page = "<!doctype html><title>Notes</title>";
const notes = { id: "notes", name: "Team notes", description: "Notes the team shares." };
const version = (extra: Record<string, unknown> = {}) => ({
  ...notes,
  guide: "# Team notes",
  files: [{ path: "index.html", text: page }],
  ...extra,
});
const said = (result: NonNullable<Reply["result"]>) => result.content?.[0]?.text ?? "";

describe("the tools a builder's AI gets", () => {
  it("offers the four app tools to an active member, each saying what it does", async () => {
    const { send } = await setup();
    const listed = (await send("ana", "tools/list", {})).body.result!.tools!;
    expect(listed.map((tool) => tool.name).sort()).toEqual([
      "slice_app_create",
      "slice_app_list",
      "slice_app_publish",
      "slice_app_status",
      "slice_apps",
    ]);
    const publish = listed.find((tool) => tool.name === "slice_app_publish")!.description;
    for (const fact of ["index.html", "1 MB", "50 files", "/__slice/me", "own address"])
      expect(publish).toContain(fact);
  });

  it("says an app is screens only while server code is off, and how to write it once it is on", async () => {
    const describe = async (server: boolean) =>
      (await (await setup({ server })).send("ana", "tools/list", {})).body.result!.tools!.find(
        (tool) => tool.name === "slice_app_publish",
      )!.description;
    const off = await describe(false);
    expect(off).toContain("no server code and no database yet");
    expect(off).not.toContain("env.DB");
    const on = await describe(true);
    for (const fact of [
      "worker.js",
      "env.DB",
      "/api/",
      "X-Slice-Member-Id",
      "CREATE TABLE IF NOT EXISTS",
      "cannot call any other service",
    ])
      expect(on).toContain(fact);
    expect(on).not.toContain("no server code and no database yet");
  });

  it("publishes server code through the tool when it is on", async () => {
    const { call } = await setup({ server: true });
    await call("ana", "slice_app_create", notes);
    const published = await call(
      "ana",
      "slice_app_publish",
      version({
        files: [
          { path: "index.html", text: page },
          { path: "worker.js", text: "export default { fetch() { return new Response('hi') } }" },
        ],
      }),
    );
    expect(published.structuredContent).toMatchObject({ version: 1, server: true, files: 1 });
  });

  it("does not offer them while member apps are switched off", async () => {
    const { send } = await setup({ memberApps: false });
    const listed = (await send("ana", "tools/list", {})).body.result!.tools!;
    expect(listed.map((tool) => tool.name)).toEqual(["slice_apps"]);
  });

  it("creates, publishes, reports and lists", async () => {
    const { call, repository, files } = await setup();
    const created = await call("ana", "slice_app_create", notes);
    expect(created.isError).toBeFalsy();
    expect(created.structuredContent).toMatchObject({
      id: "notes",
      address: "https://notes.slice.example",
      live: false,
    });
    const published = await call("ana", "slice_app_publish", version());
    expect(published.structuredContent).toMatchObject({ id: "notes", version: 1, live: true });
    expect(files.keys()).toHaveLength(1);
    expect((await repository.load()).memberApps).toMatchObject([{ live: 1 }]);
    const status = await call("ana", "slice_app_status", { id: "notes" });
    expect(status.structuredContent).toMatchObject({ live: true, liveVersion: 1, people: 0 });
    const list = await call("ana", "slice_app_list", {});
    expect(list.structuredContent).toMatchObject({ apps: [{ id: "notes" }], canCreate: 4 });
  });

  it("carries a publish far larger than an ordinary tool call", async () => {
    const { call } = await setup();
    await call("ana", "slice_app_create", notes);
    const big = "x".repeat(300 * 1024);
    const published = await call(
      "ana",
      "slice_app_publish",
      version({
        files: [
          { path: "index.html", text: page },
          { path: "a.js", text: big },
          { path: "b.js", text: big },
        ],
      }),
    );
    expect(published.structuredContent).toMatchObject({ version: 1, files: 3 });
  });

  it("refuses a request over 2 MB before reading it", async () => {
    const { send } = await setup();
    const { status } = await send("ana", "tools/call", {}, `{"pad":"${"x".repeat(2_100_000)}"}`);
    expect(status).toBe(413);
  });

  it("says what is wrong in words the AI can act on", async () => {
    const { call } = await setup();
    const badId = await call("ana", "slice_app_create", { ...notes, id: "My Notes" });
    expect(badId.isError).toBe(true);
    expect(said(badId)).toMatch(/3 to 32/);
    await call("ana", "slice_app_create", notes);
    const taken = await call("max", "slice_app_create", notes);
    expect(said(taken)).toMatch(/already in use/);
    const noIndex = await call(
      "ana",
      "slice_app_publish",
      version({ files: [{ path: "a.html", text: page }] }),
    );
    expect(noIndex.isError).toBe(true);
    expect(said(noIndex)).toMatch(/index\.html/);
  });

  it("lets only the people who run an app publish it or see its status", async () => {
    const { call, files } = await setup();
    await call("ana", "slice_app_create", notes);
    const publish = await call("max", "slice_app_publish", version());
    expect(publish.isError).toBe(true);
    expect(said(publish)).toMatch(/Only the people who run this app/);
    expect(files.keys()).toEqual([]);
    expect((await call("max", "slice_app_status", { id: "notes" })).isError).toBe(true);
    expect((await call("max", "slice_app_list", {})).structuredContent).toMatchObject({ apps: [] });
  });

  it("gives someone who is not an active member no tools at all", async () => {
    const { send } = await setup();
    const { status } = await send("pia", "tools/call", {
      name: "slice_app_create",
      arguments: notes,
    });
    expect(status).toBe(403);
  });

  it("does not tell the AI what went wrong inside the launcher", async () => {
    const { call, repository } = await setup();
    await call("ana", "slice_app_create", notes);
    const original = repository.commit.bind(repository);
    repository.commit = async () => {
      throw new Error("D1_ERROR: secret detail");
    };
    const failed = await call("ana", "slice_app_publish", version());
    repository.commit = original;
    expect(failed.isError).toBe(true);
    expect(said(failed)).not.toContain("secret detail");
    expect(said(failed)).toMatch(/could not/);
  });
});
