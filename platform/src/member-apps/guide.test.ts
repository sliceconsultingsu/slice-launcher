import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database } from "../../tests/database";
import { builderGuide } from "./guide";
import { LARGE, MAX_BUNDLE_BYTES, MAX_FILES, MAX_GUIDE, readBundle } from "./publish";
import { APP_LIMIT } from "./rules";

const screens = builderGuide({ server: false });
const withServer = builderGuide({ server: true });
const asBundle = (starter: { path: string; text: string }[]) => ({
  name: "Starter",
  description: "A starting point.",
  guide: "# Starter",
  files: starter,
});

describe("the builder's guide", () => {
  it("tells the AI how to work with someone who has never built an app", () => {
    for (const step of [
      "Ask what problem",
      "who will use it",
      "preview",
      "smallest",
      "Details",
      "cannot",
    ])
      expect(screens.guide).toContain(step);
  });

  it("states the launcher's real limits", () => {
    for (const fact of [
      `${MAX_FILES} files`,
      `${MAX_BUNDLE_BYTES / (1024 * 1024)} MB`,
      `${LARGE.files} files`,
      `${LARGE.bundleBytes / (1024 * 1024)} MB`,
      `${MAX_GUIDE.toLocaleString("en-US")} characters`,
      `${APP_LIMIT} apps`,
    ])
      expect(screens.guide).toContain(fact);
  });

  it("says there is no saved data while server code is off, and explains worker.js when it is on", () => {
    expect(screens.guide).toContain("cannot save");
    expect(screens.guide).not.toContain("env.DB");
    expect(screens.starter.map((file) => file.path)).not.toContain("worker.js");
    for (const fact of ["worker.js", "env.DB", "X-Slice-Member-Id", "CREATE TABLE IF NOT EXISTS"])
      expect(withServer.guide).toContain(fact);
    expect(withServer.starter.map((file) => file.path)).toContain("worker.js");
  });

  it("includes a recipe for sending a folder to an upload address", () => {
    expect(screens.guide).toContain("slice_app_upload");
    expect(screens.guide).toContain("curl");
  });

  it("stays small enough to hand over in one tool result", () => {
    expect(JSON.stringify(withServer).length).toBeLessThan(40_000);
  });
});

describe("the starter app", () => {
  it("is something the launcher accepts as it stands, with and without server code", () => {
    expect(readBundle(asBundle(screens.starter)).files.map((file) => file.path)).toContain(
      "index.html",
    );
    const read = readBundle(asBundle(withServer.starter), { server: true });
    expect(read.server).toContain("export default");
    expect(read.files.map((file) => file.path)).not.toContain("worker.js");
  });

  it("loads nothing from other sites and uses no inline event handlers", () => {
    for (const file of withServer.starter) {
      expect(file.text).not.toMatch(/https?:\/\//);
      expect(file.text).not.toMatch(/\son[a-z]+=/);
    }
  });
});

describe("the starter's server code, run against a real database", () => {
  let fixture: Awaited<ReturnType<typeof database>>;
  let worker: { fetch(request: Request, env: { DB: unknown }): Promise<Response> };
  beforeAll(async () => {
    fixture = await database();
    const source = withServer.starter.find((file) => file.path === "worker.js")!.text;
    worker = (
      await import(
        /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
      )
    ).default;
  }, 30_000);
  afterAll(async () => {
    await fixture?.runtime.dispose();
  });
  const call = (
    who: { id: string; name: string; manager?: boolean },
    path: string,
    init: { method?: string; body?: unknown } = {},
  ) =>
    worker.fetch(
      new Request(`https://starter.slice.example${path}`, {
        method: init.method ?? "GET",
        headers: {
          "X-Slice-Member-Id": who.id,
          "X-Slice-Member-Name": encodeURIComponent(who.name),
          "X-Slice-Manager": String(who.manager === true),
          "X-Slice-Powers": "",
          "Content-Type": "application/json",
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      }),
      { DB: fixture.db },
    );
  const ana = { id: "ana", name: "Ana Núñez" };
  const max = { id: "max", name: "Max" };

  it("starts empty, keeps what people add, and says who added it", async () => {
    expect(await (await call(ana, "/api/items")).json()).toMatchObject({ items: [] });
    expect(
      (await call(ana, "/api/items", { method: "POST", body: { title: "  Buy milk  " } })).status,
    ).toBe(201);
    const listed = (await (await call(max, "/api/items")).json()) as {
      items: { id: number; title: string; added_by_name: string }[];
    };
    expect(listed.items).toMatchObject([{ title: "Buy milk", added_by_name: "Ana Núñez" }]);
  });

  it("refuses an item with no title", async () => {
    expect((await call(ana, "/api/items", { method: "POST", body: { title: " " } })).status).toBe(
      400,
    );
    expect((await call(ana, "/api/items", { method: "POST", body: "nonsense" })).status).toBe(400);
  });

  it("lets only the person who added an item, or someone who runs the app, remove it", async () => {
    await call(ana, "/api/items", { method: "POST", body: { title: "Ana's" } });
    const { items } = (await (await call(ana, "/api/items")).json()) as {
      items: { id: number; title: string }[];
    };
    const id = items.find((item) => item.title === "Ana's")!.id;
    expect((await call(max, `/api/items/${id}`, { method: "DELETE" })).status).toBe(403);
    expect(
      (await call({ ...max, manager: true }, `/api/items/${id}`, { method: "DELETE" })).status,
    ).toBe(200);
    expect((await call(ana, `/api/items/${id}`, { method: "DELETE" })).status).toBe(404);
  });

  it("answers 404 for an address it does not know", async () => {
    expect((await call(ana, "/api/other")).status).toBe(404);
  });
});
