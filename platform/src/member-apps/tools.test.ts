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
  const appCalls: string[] = [];
  const memberApps = new MemberApps({
    repository,
    files,
    origin: "https://slice.example",
    startUpload: async () => "t".repeat(43),
    ...(options.server
      ? {
          cloud: { ensureDatabase: async () => "db-1", uploadServer: async () => {} },
          // A stand-in for the app's own server code: it answers the one tool these tests use.
          server: () => ({
            fetch: async (request: Request) => {
              appCalls.push(new URL(request.url).pathname);
              const input = (await request.json()) as { query: string };
              return input.query === "nothing"
                ? Response.json({ error: "No entry matches." }, { status: 404 })
                : Response.json({
                    query: input.query,
                    asked: request.headers.get("X-Slice-Member-Id"),
                  });
            },
          }),
        }
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
  const save = async (name: string, command: unknown) => {
    const state = await repository.load();
    await repository.commit(
      state,
      applyCommand(state, `${name}-sub`, command, {
        id: crypto.randomUUID(),
        now: "2026-11-19T11:00:00Z",
      }),
    );
  };
  return { repository, files, send, call, save, appCalls };
}
type Reply = {
  result?: {
    tools?: {
      name: string;
      description: string;
      inputSchema?: unknown;
      annotations?: Record<string, boolean>;
    }[];
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
      "slice_app_guide",
      "slice_app_list",
      "slice_app_publish",
      "slice_app_status",
      "slice_app_upload",
      "slice_apps",
    ]);
    // The tools that change something send the AI to the guide first.
    for (const name of ["slice_app_create", "slice_app_publish"])
      expect(listed.find((tool) => tool.name === name)!.description).toContain("slice_app_guide");
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

  it("publishes a preview when asked, leaving what is live alone", async () => {
    const { call, repository } = await setup();
    await call("ana", "slice_app_create", notes);
    await call("ana", "slice_app_publish", version());
    const preview = await call("ana", "slice_app_publish", { ...version(), preview: true });
    expect(preview.structuredContent).toMatchObject({ version: 2, live: false, preview: true });
    expect((await repository.load()).memberApps).toMatchObject([{ live: 1, preview: 2 }]);
    const status = await call("ana", "slice_app_status", { id: "notes" });
    expect(status.structuredContent).toMatchObject({ liveVersion: 1, previewVersion: 2 });
  });

  it("hands over the builder's guide and a starter app that the launcher would accept", async () => {
    const { call } = await setup();
    const given = (await call("ana", "slice_app_guide", {})).structuredContent as {
      guide: string;
      starter: { path: string; text: string }[];
    };
    expect(given.guide).toContain("Ask what problem");
    expect(given.starter.map((file) => file.path)).toContain("index.html");
    await call("ana", "slice_app_create", notes);
    const published = await call("ana", "slice_app_publish", version({ files: given.starter }));
    expect(published.isError).toBeFalsy();
  });

  it("gives an AI that can run commands a one-time address for a larger app", async () => {
    const { call } = await setup();
    await call("ana", "slice_app_create", notes);
    const given = await call("ana", "slice_app_upload", { id: "notes", preview: true });
    expect(given.structuredContent).toMatchObject({
      address: `https://slice.example/api/app-upload/${"t".repeat(43)}`,
      minutes: 10,
      preview: true,
    });
    expect((await call("max", "slice_app_upload", { id: "notes" })).isError).toBe(true);
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

describe("the tools an app offers, through a member's AI connection", () => {
  const find = {
    name: "find_entry",
    description: "Find entries by part of their title.",
    readOnly: true,
    input: {
      type: "object",
      properties: { query: { type: "string", maxLength: 20 } },
      required: ["query"],
    },
  };
  const withTools = version({
    files: [
      { path: "index.html", text: page },
      { path: "worker.js", text: "export default {}" },
    ],
    tools: [find],
  });
  async function published() {
    const made = await setup({ server: true });
    await made.call("ana", "slice_app_create", notes);
    const result = await made.call("ana", "slice_app_publish", withTools);
    const listed = async (name: string) =>
      (await made.send(name, "tools/list", {})).body.result!.tools!.filter((tool) =>
        tool.name.includes("__"),
      );
    return { ...made, result, listed };
  }

  it("tells the builder's AI how tools work, and who is offered them, only when they can be answered", async () => {
    const describe = async (server: boolean) =>
      (await (await setup({ server })).send("ana", "tools/list", {})).body.result!.tools!.find(
        (tool) => tool.name === "slice_app_publish",
      )!.description;
    expect(await describe(false)).not.toContain("/__slice/tools/");
    const on = await describe(true);
    for (const fact of ["/__slice/tools/<name>", "<app id>__<name>", "a Slice owner agrees"])
      expect(on).toContain(fact);
  });

  it("publishes an app's tools and offers them to the person who runs it, as the app described them", async () => {
    const { result, listed } = await published();
    expect(result.structuredContent).toMatchObject({ version: 1, tools: 1 });
    expect(String(result.structuredContent!.toolsNote)).toContain("until a Slice owner agrees");
    expect(await listed("ana")).toEqual([
      {
        name: "notes__find_entry",
        description: expect.stringMatching(
          /^A tool of the Slice member app "notes"\. .* Find entries by part of their title\.$/,
        ),
        inputSchema: expect.objectContaining({
          type: "object",
          properties: { query: { type: "string", maxLength: 20 } },
          required: ["query"],
          additionalProperties: false,
        }),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      },
    ]);
    // Nobody else yet: not someone the app is not shared with, and not the owner.
    expect(await listed("max")).toEqual([]);
    expect(await listed("owner")).toEqual([]);
  });

  it("checks a call against the app's own description before the app sees it", async () => {
    const { call, appCalls } = await published();
    const good = await call("ana", "notes__find_entry", { query: "plan" });
    expect(good.isError).toBeFalsy();
    expect(good.structuredContent).toEqual({ query: "plan", asked: "ana-member" });
    expect(appCalls).toEqual(["/__slice/tools/find_entry"]);
    for (const bad of [{}, { query: 7 }, { query: "x".repeat(21) }, { query: "x", extra: true }])
      expect((await call("ana", "notes__find_entry", bad)).isError).toBe(true);
    expect(appCalls).toHaveLength(1);
  });

  it("offers them to the people the app is shared with once an owner has agreed", async () => {
    const { call, save, send, listed, repository } = await published();
    await save("ana", {
      type: "app.update",
      id: "notes",
      visibility: "private",
      managers: ["ana-member"],
      people: [{ memberId: "max-member", powers: [] }],
    });
    // Listed for nobody else, and a call by its exact name is refused all the same.
    expect(await listed("max")).toEqual([]);
    const early = await send("max", "tools/call", {
      name: "notes__find_entry",
      arguments: { query: "plan" },
    });
    expect(early.body.result?.isError ?? Boolean(early.body.error)).toBe(true);
    await save("owner", {
      type: "memberapp.tools",
      id: "notes",
      approve: (await repository.load()).memberApps[0].tools!.digest,
    });
    expect((await listed("max")).map((tool) => tool.name)).toEqual(["notes__find_entry"]);
    expect((await call("max", "notes__find_entry", { query: "plan" })).structuredContent).toEqual({
      query: "plan",
      asked: "max-member",
    });
    // The app's own refusal reaches the AI, in the app's words.
    const refused = await call("max", "notes__find_entry", { query: "nothing" });
    expect(refused.isError).toBe(true);
    expect(said(refused)).toBe("The app refused: No entry matches.");
  });
});
