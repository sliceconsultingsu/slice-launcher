import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { database, migrate, reset } from "../../tests/database";
import { memoryFiles } from "../../tests/member-apps/memory-files";
import { applyCommand, enroll } from "../membership/domain";
import { Repository } from "../membership/repository";
import { createSession, endSession } from "../membership/session";
import { APP_COOKIE, issuePass, redeemPass, STATE_COOKIE } from "./app-sessions";
import { createFrontDoor } from "./front-door";
import { MemberApps } from "./service";

let fixture: Awaited<ReturnType<typeof database>>;
beforeAll(async () => {
  fixture = await database();
  await migrate(fixture.db);
}, 30_000);
beforeEach(async () => {
  await reset(fixture.db);
  await fixture.db.prepare("DELETE FROM sessions").run();
});
afterAll(async () => {
  await fixture?.runtime.dispose();
});

const launcher = "https://slice.example";
const who = (name: string) => ({
  subject: `${name}-sub`,
  email: `${name}@example.test`,
  emailManaged: true,
});
const page = "<!doctype html><title>Notes</title><script src='js/app.js'></script>";
const publishNotes = (extra: Record<string, unknown> = {}) => ({
  name: "Notes",
  description: "Shared notes.",
  guide: "# Notes",
  powers: [{ id: "edit", label: "Edit notes" }],
  files: [
    { path: "index.html", text: page },
    { path: "js/app.js", text: "console.log('notes')" },
    { path: "docs/index.html", text: "<p>docs</p>" },
    { path: "img/dot.png", base64: "iVBORw0KGgo=" },
  ],
  ...extra,
});

/**
 * Ana runs the live app "notes"; Max is on it with the power to edit; Sam is an active member
 * who is not on it; "ledger" is Sam's own live app.
 */
async function setup() {
  const repository = new Repository(fixture.db);
  const files = memoryFiles();
  const apps = new MemberApps({ repository, files, origin: launcher });
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
  for (const name of ["owner", "ana", "max", "sam"]) {
    const state = await repository.load();
    const joined = enroll(state, who(name), { id: `${name}-member`, now: "2026-11-19T09:00:00Z" });
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
    await save(`${name}-sub`, {
      type: "profile.update",
      name: name[0].toUpperCase() + name.slice(1),
      title: "",
    });
  }
  await apps.create(who("ana"), { id: "notes", name: "Notes", description: "Shared notes." });
  await apps.publish(who("ana"), "notes", publishNotes());
  await save("ana-sub", {
    type: "app.update",
    id: "notes",
    visibility: "private",
    managers: ["ana-member"],
    people: [{ memberId: "max-member", powers: ["edit"] }],
  });
  await apps.create(who("sam"), { id: "ledger", name: "Ledger", description: "A ledger." });
  await apps.publish(
    who("sam"),
    "ledger",
    publishNotes({ name: "Ledger", powers: [], files: [{ path: "index.html", text: "ledger" }] }),
  );
  const door = createFrontDoor({
    db: fixture.db,
    loadState: () => repository.load(),
    version: (appId, version) => repository.version(appId, version),
    files,
    origin: launcher,
  });
  /** A browser signed in to the launcher as this person, then carried to one app. */
  const enter = async (name: string, appId = "notes") => {
    const session = await createSession(fixture.db, who(name), "test browser");
    const atLauncher = new Request(`${launcher}/`, { headers: { Cookie: session.split(";")[0] } });
    const pass = await issuePass(fixture.db, atLauncher, appId, STATE);
    const setCookie = await redeemPass(
      fixture.db,
      appId,
      pass ?? "",
      new Request(`https://${appId}.slice.example/`, { headers: { Cookie: stateCookie } }),
    );
    return { cookie: setCookie!.split(";")[0], atLauncher };
  };
  return { repository, files, apps, save, door, enter };
}
/** The state a browser holds after the app's address started its sign-in. */
const STATE = "s".repeat(43);
const stateCookie = `${STATE_COOKIE}=${STATE}`;
type Sent = { cookie?: string; method?: string; headers?: Record<string, string>; body?: string };
const request = (appId: string, path: string, sent: Sent = {}) =>
  new Request(`https://${appId}.slice.example${path}`, {
    method: sent.method ?? "GET",
    headers: {
      ...(sent.cookie ? { Cookie: sent.cookie } : {}),
      // What a browser sends when someone opens a page.
      ...(sent.method && sent.method !== "GET"
        ? {}
        : { Accept: "text/html", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" }),
      ...sent.headers,
    },
    body: sent.body,
  });
const where = (response: Response) => response.headers.get("Location") ?? "";

describe("serving a member app to someone who may open it", () => {
  it("serves the first screen, folders and files with their types", async () => {
    const { door, enter } = await setup();
    const { cookie } = await enter("max");
    const home = await door(request("notes", "/", { cookie }), "notes");
    expect(home.status).toBe(200);
    expect(home.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await home.text()).toBe(page);
    expect(await (await door(request("notes", "/index.html", { cookie }), "notes")).text()).toBe(
      page,
    );
    expect(await (await door(request("notes", "/docs/", { cookie }), "notes")).text()).toBe(
      "<p>docs</p>",
    );
    const script = await door(request("notes", "/js/app.js", { cookie }), "notes");
    expect(script.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    const image = await door(request("notes", "/img/dot.png", { cookie }), "notes");
    expect(image.headers.get("Content-Type")).toBe("image/png");
    expect([...new Uint8Array(await image.arrayBuffer())].slice(0, 4)).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
  });

  it("sets the browser rules on every file it serves", async () => {
    const { door, enter } = await setup();
    const { cookie } = await enter("max");
    for (const path of ["/", "/js/app.js", "/img/dot.png"]) {
      const response = await door(request("notes", path, { cookie }), "notes");
      const policy = response.headers.get("Content-Security-Policy") ?? "";
      for (const rule of [
        "default-src 'self'",
        "connect-src 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "object-src 'none'",
      ])
        expect(policy).toContain(rule);
      expect(policy).not.toMatch(/https?:|\*/);
      expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      expect(response.headers.get("Set-Cookie")).toBeNull();
    }
  });

  it("answers HEAD without a body and refuses other methods on files", async () => {
    const { door, enter } = await setup();
    const { cookie } = await enter("max");
    const head = await door(request("notes", "/", { cookie, method: "HEAD" }), "notes");
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    const posted = await door(
      request("notes", "/index.html", {
        cookie,
        method: "POST",
        headers: { Origin: "https://notes.slice.example" },
        body: "x",
      }),
      "notes",
    );
    expect(posted.status).toBe(405);
  });

  it("tells the app's page who is using it, without their email", async () => {
    const { door, enter } = await setup();
    const max = await door(
      request("notes", "/__slice/me", { cookie: (await enter("max")).cookie }),
      "notes",
    );
    expect(max.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await max.json()).toEqual({
      id: "max-member",
      name: "Max",
      manager: false,
      preview: false,
      powers: ["edit"],
    });
    const ana = await door(
      request("notes", "/__slice/me", { cookie: (await enter("ana")).cookie }),
      "notes",
    );
    expect(await ana.json()).toEqual({
      id: "ana-member",
      name: "Ana",
      manager: true,
      preview: false,
      powers: ["edit"],
    });
  });

  it("serves the version that is live, and an earlier one when that is put back", async () => {
    const { door, enter, apps, save } = await setup();
    const { cookie } = await enter("max");
    await apps.publish(
      who("ana"),
      "notes",
      publishNotes({ files: [{ path: "index.html", text: "second" }] }),
    );
    expect(await (await door(request("notes", "/", { cookie }), "notes")).text()).toBe("second");
    // A file only the first version had is gone.
    expect((await door(request("notes", "/js/app.js", { cookie }), "notes")).status).toBe(404);
    await save("ana-sub", { type: "memberapp.live", id: "notes", version: 1 });
    expect(await (await door(request("notes", "/", { cookie }), "notes")).text()).toBe(page);
  });

  it.each([
    "/missing.html",
    "/js/",
    "/js",
    "/../ledger/index.html",
    "/..%2findex.html",
    "/js/..%2f..%2findex.html",
    "/.env",
    "/index.html%00.png",
    "/%E0%A4%A",
    "//index.html",
    "/api",
  ])("answers 404 for %s", async (path) => {
    const { door, enter } = await setup();
    const { cookie } = await enter("max");
    expect((await door(request("notes", path, { cookie }), "notes")).status).toBe(404);
  });

  it("stays inside the app when a path tries to climb out of it", async () => {
    const { door, enter } = await setup();
    const { cookie } = await enter("max");
    // Browsers and the Worker runtime resolve these before the request is read: they are the
    // app's own first screen, never another app's file.
    for (const path of ["/%2e%2e/index.html", "/../../index.html", "/js/../index.html"]) {
      const response = await door(request("notes", path, { cookie }), "notes");
      expect(await response.text()).toBe(page);
    }
  });

  it("serves only files the live version's record lists, whatever the store holds", async () => {
    const { door, enter, files, repository } = await setup();
    const { cookie } = await enter("max");
    const record = await repository.version("notes", 1);
    await files.put("notes", record!.store, [
      { path: "planted.html", type: "text/html", body: new TextEncoder().encode("planted") },
    ]);
    expect((await door(request("notes", "/planted.html", { cookie }), "notes")).status).toBe(404);
  });

  it("has no server code to answer addresses under /api/", async () => {
    const { door, enter } = await setup();
    const { cookie } = await enter("max");
    const response = await door(request("notes", "/api/items", { cookie }), "notes");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "This app has no server code." });
  });
});

describe("keeping everyone else out", () => {
  it("sends a browser with no session to the launcher for a pass, keeping where it was going", async () => {
    const { door } = await setup();
    const response = await door(request("notes", "/docs/?tab=2"), "notes");
    expect(response.status).toBe(302);
    // It also starts the sign-in: a state only this browser holds, which the pass must match.
    const started = response.headers.get("Set-Cookie") ?? "";
    expect(started).toMatch(
      /^__Host-slice_app_state=[\w-]{43}; Max-Age=600; HttpOnly; Secure; SameSite=Lax; Path=\/$/,
    );
    const state = started.split(";")[0].split("=")[1];
    expect(where(response)).toBe(
      `${launcher}/api/app-pass?app=notes&next=${encodeURIComponent("/docs/?tab=2")}&state=${state}`,
    );
    const again = await door(request("notes", "/docs/?tab=2"), "notes");
    expect(again.headers.get("Set-Cookie")).not.toBe(started);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 401, not a redirect, to anything that is not a page being opened", async () => {
    const { door } = await setup();
    const script = await door(
      request("notes", "/js/app.js", {
        headers: { "Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Dest": "script", Accept: "*/*" },
      }),
      "notes",
    );
    expect(script.status).toBe(401);
    const me = await door(
      request("notes", "/__slice/me", {
        headers: { "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty", Accept: "*/*" },
      }),
      "notes",
    );
    expect(me.status).toBe(401);
    expect(await me.json()).toEqual({ error: "Sign in to Slice." });
  });

  it("does not say whether an app exists to a browser that is not signed in", async () => {
    const { door } = await setup();
    const real = await door(request("notes", "/"), "notes");
    const none = await door(request("nowhere", "/"), "nowhere");
    expect(none.status).toBe(real.status);
    expect(where(none)).toContain(`${launcher}/api/app-pass?app=nowhere&next=%2F&state=`);
  });

  it("refuses a session from another app", async () => {
    const { door, enter } = await setup();
    const { cookie } = await enter("sam", "ledger");
    expect((await door(request("ledger", "/", { cookie }), "ledger")).status).toBe(200);
    const response = await door(request("notes", "/", { cookie }), "notes");
    expect(response.status).toBe(302);
    expect(where(response)).toContain("/api/app-pass?app=notes");
  });

  it("sends someone signed in but not on the app to its page in the launcher", async () => {
    const { door, enter, save } = await setup();
    // Max holds a session at notes, then is taken off the app.
    const { cookie } = await enter("max");
    await save("ana-sub", {
      type: "app.update",
      id: "notes",
      visibility: "private",
      managers: ["ana-member"],
      people: [],
    });
    const opened = await door(request("notes", "/", { cookie }), "notes");
    expect(opened.status).toBe(302);
    expect(where(opened)).toBe(`${launcher}/about/notes`);
    const fetched = await door(
      request("notes", "/__slice/me", {
        cookie,
        headers: { "Sec-Fetch-Mode": "cors", Accept: "*/*" },
      }),
      "notes",
    );
    expect(fetched.status).toBe(403);
    expect(await fetched.text()).not.toContain("Max");
  });

  it("stops serving a suspended member on their next request", async () => {
    const { door, enter, save, repository } = await setup();
    const { cookie } = await enter("max");
    expect((await door(request("notes", "/", { cookie }), "notes")).status).toBe(200);
    // Suspension through the launcher also ends their sessions; here only the status changes,
    // to show the check does not depend on that.
    const state = await repository.load();
    const next = structuredClone(state);
    next.members.find((m) => m.id === "max-member")!.status = "suspended";
    next.revision += 1;
    await fixture.db
      .prepare("UPDATE members SET document = ? WHERE id = 'max-member'")
      .bind(JSON.stringify(next.members.find((m) => m.id === "max-member")))
      .run();
    const response = await door(request("notes", "/", { cookie }), "notes");
    expect(response.status).toBe(302);
    expect(where(response)).toBe(`${launcher}/account`);
    void save;
  });

  it("stops serving when the person signs out of the launcher", async () => {
    const { door, enter } = await setup();
    const { cookie, atLauncher } = await enter("max");
    await endSession(atLauncher, fixture.db);
    expect((await door(request("notes", "/", { cookie }), "notes")).status).toBe(302);
  });

  it("serves nobody while the app is offline or after it is deleted", async () => {
    const { door, enter, save } = await setup();
    const { cookie } = await enter("ana");
    await save("ana-sub", { type: "memberapp.live", id: "notes", version: null });
    const offline = await door(request("notes", "/", { cookie }), "notes");
    expect(offline.status).toBe(302);
    expect(where(offline)).toBe(`${launcher}/about/notes`);
    await save("ana-sub", { type: "memberapp.delete", id: "notes" });
    expect((await door(request("notes", "/", { cookie }), "notes")).status).toBe(404);
  });
});

describe("a preview", () => {
  const next = "<!doctype html><title>Notes, next</title>";
  /** Version 2 of "notes" is a preview; version 1 is live. */
  async function previewing() {
    const context = await setup();
    await context.apps.publish(
      who("ana"),
      "notes",
      publishNotes({ files: [{ path: "index.html", text: next }] }),
      { preview: true },
    );
    return context;
  }
  const text = async (response: Response) => response.text();

  it("is served to the people who run the app, and the live version to everyone else", async () => {
    const { door, enter } = await previewing();
    const ana = await enter("ana");
    const max = await enter("max");
    const owner = await enter("owner");
    expect(await text(await door(request("notes", "/", { cookie: ana.cookie }), "notes"))).toBe(
      next,
    );
    expect(await text(await door(request("notes", "/", { cookie: owner.cookie }), "notes"))).toBe(
      next,
    );
    expect(await text(await door(request("notes", "/", { cookie: max.cookie }), "notes"))).toBe(
      page,
    );
    // A file only the live version has is not in the preview, and the other way round.
    expect(
      (await door(request("notes", "/js/app.js", { cookie: ana.cookie }), "notes")).status,
    ).toBe(404);
    expect(
      (await door(request("notes", "/js/app.js", { cookie: max.cookie }), "notes")).status,
    ).toBe(200);
  });

  it("tells the app's page whether it is being shown as a preview", async () => {
    const { door, enter } = await previewing();
    const me = async (name: string) =>
      (await (
        await door(request("notes", "/__slice/me", { cookie: (await enter(name)).cookie }), "notes")
      ).json()) as { preview: boolean };
    expect((await me("ana")).preview).toBe(true);
    expect((await me("max")).preview).toBe(false);
  });

  it("stops being shown to someone the moment they no longer run the app", async () => {
    const { door, enter, save } = await previewing();
    const { cookie } = await enter("ana");
    expect(await text(await door(request("notes", "/", { cookie }), "notes"))).toBe(next);
    // The owner takes Ana off the managers and leaves her on the app.
    await save("owner-sub", {
      type: "app.update",
      id: "notes",
      visibility: "private",
      managers: [],
      people: [
        { memberId: "ana-member", powers: [] },
        { memberId: "max-member", powers: [] },
      ],
    });
    expect(await text(await door(request("notes", "/", { cookie }), "notes"))).toBe(page);
  });

  it("of an app that has never been live opens for the people who run it and nobody else", async () => {
    const { door, enter, apps, save } = await setup();
    await apps.create(who("ana"), { id: "draft", name: "Draft", description: "Not ready." });
    await apps.publish(
      who("ana"),
      "draft",
      publishNotes({ name: "Draft", powers: [], files: [{ path: "index.html", text: next }] }),
      { preview: true },
    );
    await save("ana-sub", {
      type: "app.update",
      id: "draft",
      visibility: "private",
      managers: ["ana-member"],
      people: [{ memberId: "max-member", powers: [] }],
    });
    const ana = await enter("ana", "draft").catch(() => null);
    expect(ana).not.toBeNull();
    expect(await text(await door(request("draft", "/", { cookie: ana!.cookie }), "draft"))).toBe(
      next,
    );
    // Max is on the app, but there is nothing live for him.
    const session = await createSession(fixture.db, who("max"), "test browser");
    const atLauncher = new Request(`${launcher}/`, { headers: { Cookie: session.split(";")[0] } });
    const pass = await issuePass(fixture.db, atLauncher, "draft", STATE);
    const maxCookie = (await redeemPass(
      fixture.db,
      "draft",
      pass!,
      new Request("https://draft.slice.example/", { headers: { Cookie: stateCookie } }),
    ))!.split(";")[0];
    const refused = await door(request("draft", "/", { cookie: maxCookie }), "draft");
    expect(refused.status).toBe(302);
    expect(where(refused)).toBe(`${launcher}/about/draft`);
  });

  it("is gone for everyone once it is discarded", async () => {
    const { door, enter, save } = await previewing();
    const { cookie } = await enter("ana");
    await save("ana-sub", { type: "memberapp.preview", id: "notes", version: null });
    expect(await text(await door(request("notes", "/", { cookie }), "notes"))).toBe(page);
  });
});

describe("requests from other sites and other apps", () => {
  it.each([
    [
      "a script on another app",
      { "Sec-Fetch-Site": "same-site", "Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Dest": "script" },
    ],
    [
      "a fetch from another app",
      { "Sec-Fetch-Site": "same-site", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty" },
    ],
    [
      "an image on another site",
      { "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Dest": "image" },
    ],
    [
      "a frame on another app",
      { "Sec-Fetch-Site": "same-site", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
    ],
  ])("refuses %s, even with the person's session", async (_what, headers) => {
    const { door, enter } = await setup();
    const { cookie } = await enter("max");
    for (const path of ["/", "/js/app.js", "/__slice/me"]) {
      const response = await door(request("notes", path, { cookie, headers }), "notes");
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain("Max");
    }
  });

  it("lets a link from the launcher or another site open the app", async () => {
    const { door, enter } = await setup();
    const { cookie } = await enter("max");
    for (const site of ["same-site", "cross-site", "none", "same-origin"]) {
      const response = await door(
        request("notes", "/", { cookie, headers: { "Sec-Fetch-Site": site } }),
        "notes",
      );
      expect(response.status).toBe(200);
    }
  });

  it.each([
    ["no Origin", {}],
    ["another app's Origin", { Origin: "https://ledger.slice.example" }],
    ["the launcher's Origin", { Origin: "https://slice.example" }],
    ["a null Origin", { Origin: "null" }],
  ])("refuses a change sent with %s", async (_what, headers) => {
    const { door, enter } = await setup();
    const { cookie } = await enter("max");
    const response = await door(
      request("notes", "/api/items", { cookie, method: "POST", headers, body: "{}" }),
      "notes",
    );
    expect(response.status).toBe(403);
  });
});

describe("arriving with a pass", () => {
  /** A pass for this person, issued against the state this test's browser holds. */
  async function pass(name: string, appId = "notes") {
    const session = await createSession(fixture.db, who(name), "test browser");
    const atLauncher = new Request(`${launcher}/`, { headers: { Cookie: session.split(";")[0] } });
    return (await issuePass(fixture.db, atLauncher, appId, STATE))!;
  }
  const appCookie = (response: Response) =>
    response.headers.getSetCookie().find((item) => item.startsWith(`${APP_COOKIE}=`));

  it("signs the browser in at the app and sends it on to where it was going", async () => {
    const context = await setup();
    const token = await pass("max");
    const response = await context.door(
      request(
        "notes",
        `/__slice/session?pass=${token}&next=${encodeURIComponent("/docs/?tab=2")}`,
        {
          cookie: stateCookie,
        },
      ),
      "notes",
    );
    expect(response.status).toBe(303);
    expect(where(response)).toBe("/docs/?tab=2");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    const cookie = appCookie(response)!;
    expect(cookie).toMatch(
      new RegExp(
        `^${APP_COOKIE}=[\\w-]{43}; Max-Age=86400; HttpOnly; Secure; SameSite=Lax; Path=/$`,
      ),
    );
    // The state has done its job and is cleared.
    expect(response.headers.getSetCookie()).toContain(
      `${STATE_COOKIE}=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/`,
    );
    const opened = await context.door(
      request("notes", "/docs/", { cookie: cookie.split(";")[0] }),
      "notes",
    );
    expect(opened.status).toBe(200);
  });

  it("does not sign a browser in with a pass someone else obtained and sent it", async () => {
    const context = await setup();
    // Max, who may open the app, gets a pass and lures another person's browser to the link.
    const lure = `/__slice/session?pass=${await pass("max")}&next=%2F`;
    for (const cookie of [undefined, `${STATE_COOKIE}=${"v".repeat(43)}`]) {
      const response = await context.door(request("notes", lure, { cookie }), "notes");
      expect(response.status).toBe(302);
      expect(where(response)).toBe(`${launcher}/about/notes`);
      expect(appCookie(response)).toBeUndefined();
    }
  });

  it("carries on to where it was going if this browser is already signed in at the app", async () => {
    const context = await setup();
    const { cookie } = await context.enter("max");
    // A second tab's pass arrives after the first tab finished: its state is gone.
    const late = `/__slice/session?pass=${await pass("max")}&next=%2Fdocs%2F`;
    const response = await context.door(request("notes", late, { cookie }), "notes");
    expect(response.status).toBe(303);
    expect(where(response)).toBe("/docs/");
    expect(appCookie(response)).toBeUndefined();
  });

  it("sends a browser with a used, made-up or wrong-app pass to the app's page, with no cookie", async () => {
    const context = await setup();
    const token = await pass("max");
    await context.door(
      request("notes", `/__slice/session?pass=${token}`, { cookie: stateCookie }),
      "notes",
    );
    const forLedger = await pass("sam", "ledger");
    for (const value of [token, "x".repeat(43), "", forLedger]) {
      const response = await context.door(
        request("notes", `/__slice/session?pass=${value}`, { cookie: stateCookie }),
        "notes",
      );
      expect(response.status).toBe(302);
      expect(where(response)).toBe(`${launcher}/about/notes`);
      expect(appCookie(response)).toBeUndefined();
    }
  });

  it.each([
    "//evil.example/x",
    "https://evil.example/",
    "/\\evil.example",
    "/__slice/session?pass=x",
  ])("lands on the first screen when asked to continue to %s", async (next) => {
    const context = await setup();
    const token = await pass("max");
    const response = await context.door(
      request("notes", `/__slice/session?pass=${token}&next=${encodeURIComponent(next)}`, {
        cookie: stateCookie,
      }),
      "notes",
    );
    expect(where(response)).toBe("/");
  });

  it("does not accept a pass sent as anything but a page being opened", async () => {
    const context = await setup();
    const token = await pass("max");
    const posted = await context.door(
      request("notes", `/__slice/session?pass=${token}`, {
        cookie: stateCookie,
        method: "POST",
        headers: { Origin: "https://notes.slice.example" },
        body: "",
      }),
      "notes",
    );
    expect(posted.status).toBe(405);
    expect(appCookie(posted)).toBeUndefined();
  });
});

describe("an app's server code", () => {
  const code = "export default { fetch() { return new Response('hi') } }";
  /**
   * The same people and apps, with a third version of "notes" that has server code. The Worker is
   * a stand-in: it records what the launcher sent it and answers as `reply` says.
   */
  async function withServer(
    reply: () => Response | Promise<Response> = () => Response.json({ ok: true }),
  ) {
    const context = await setup();
    const publisher = new MemberApps({
      repository: context.repository,
      files: context.files,
      origin: launcher,
      cloud: { ensureDatabase: async () => "db-notes", uploadServer: async () => {} },
    });
    await publisher.publish(
      who("ana"),
      "notes",
      publishNotes({
        files: [
          { path: "index.html", text: page },
          { path: "worker.js", text: code },
        ],
      }),
    );
    const script = (await context.repository.version("notes", 2))!.server!.script;
    const seen: { script: string; request: Request; body: string }[] = [];
    const door = (server = true) =>
      createFrontDoor({
        db: fixture.db,
        loadState: () => context.repository.load(),
        version: (appId, version) => context.repository.version(appId, version),
        files: context.files,
        origin: launcher,
        ...(server
          ? {
              server: (name: string) =>
                name === script
                  ? {
                      fetch: async (request: Request) => {
                        seen.push({ script: name, request, body: await request.clone().text() });
                        return reply();
                      },
                    }
                  : null,
            }
          : {}),
      });
    return { ...context, door: door(), doorWithoutServer: door(false), seen, script };
  }
  const called = {
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    Accept: "application/json",
  };

  it("gets requests under /api/ with who is asking, as the launcher knows them", async () => {
    const { door, enter, seen, script } = await withServer();
    const { cookie } = await enter("max");
    const response = await door(
      request("notes", "/api/items?tab=2", {
        cookie,
        headers: {
          ...called,
          Authorization: "Bearer from-the-browser",
          "x-slice-member-id": "owner-member",
          "X-SLICE-MANAGER": "true",
          "X-Slice-Anything": "made up",
          "X-Requested-With": "the app's own page",
        },
      }),
      "notes",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(seen).toHaveLength(1);
    const sent = seen[0].request;
    expect(seen[0].script).toBe(script);
    expect(sent.url).toBe("https://notes.slice.example/api/items?tab=2");
    expect(sent.method).toBe("GET");
    expect(sent.headers.get("X-Slice-Member-Id")).toBe("max-member");
    expect(sent.headers.get("X-Slice-Member-Name")).toBe("Max");
    expect(sent.headers.get("X-Slice-Manager")).toBe("false");
    expect(sent.headers.get("X-Slice-Powers")).toBe("edit");
    expect(sent.headers.get("X-Slice-Anything")).toBeNull();
    expect(sent.headers.get("Cookie")).toBeNull();
    expect(sent.headers.get("Authorization")).toBeNull();
    expect(sent.headers.get("X-Requested-With")).toBe("the app's own page");
  });

  it("tells the code when the person runs the app, and encodes a name that is not plain text", async () => {
    const { door, enter, seen, save } = await withServer();
    await save("ana-sub", { type: "profile.update", name: "Ana Núñez, PhD", title: "" });
    const { cookie } = await enter("ana");
    await door(request("notes", "/api/items", { cookie, headers: called }), "notes");
    const sent = seen[0].request;
    expect(sent.headers.get("X-Slice-Manager")).toBe("true");
    expect(decodeURIComponent(sent.headers.get("X-Slice-Member-Name")!)).toBe("Ana Núñez, PhD");
    expect(sent.headers.get("X-Slice-Member-Name")).toMatch(/^[\x20-\x7e]+$/);
  });

  it("passes on a change from the app's own page, with its body", async () => {
    const { door, enter, seen } = await withServer(() => new Response(null, { status: 201 }));
    const { cookie } = await enter("max");
    const response = await door(
      request("notes", "/api/items", {
        cookie,
        method: "POST",
        headers: { Origin: "https://notes.slice.example", "Content-Type": "application/json" },
        body: '{"title":"Buy milk"}',
      }),
      "notes",
    );
    expect(response.status).toBe(201);
    expect(seen[0].request.method).toBe("POST");
    expect(seen[0].request.headers.get("Content-Type")).toBe("application/json");
    expect(seen[0].body).toBe('{"title":"Buy milk"}');
  });

  it("never passes a page's request to the address the app's tools are answered at", async () => {
    // A tool call comes only from the launcher, for a person it has checked for that tool. A
    // page reaching the same address would get round the owner's OK and the tool's power.
    const { door, enter, seen } = await withServer();
    const { cookie } = await enter("max");
    for (const path of ["/__slice/tools/find_entry", "/__slice/tools/", "/__slice/tools"]) {
      const read = await door(request("notes", path, { cookie, headers: called }), "notes");
      expect(read.status).toBe(404);
      const change = await door(
        request("notes", path, {
          cookie,
          method: "POST",
          headers: { Origin: "https://notes.slice.example", "Content-Type": "application/json" },
          body: "{}",
        }),
        "notes",
      );
      expect(change.status).toBe(404);
    }
    expect(seen).toEqual([]);
  });

  it("cleans the answer: no cookie can be set, and the browser rules still apply", async () => {
    const { door, enter } = await withServer(
      () =>
        new Response("<p>hi</p>", {
          status: 200,
          headers: [
            ["Content-Type", "text/html"],
            ["Set-Cookie", "__Host-slice_app=stolen; Path=/; Secure"],
            ["Set-Cookie", "other=1; Domain=slice.example"],
            ["Content-Security-Policy", "default-src *"],
            ["X-From-The-App", "kept"],
          ],
        }),
    );
    const { cookie } = await enter("max");
    const response = await door(
      request("notes", "/api/page", { cookie, headers: called }),
      "notes",
    );
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get("Content-Security-Policy")).toContain("connect-src 'self'");
    expect(response.headers.get("Content-Security-Policy")).not.toContain("*");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("X-From-The-App")).toBe("kept");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("<p>hi</p>");
  });

  it("does not let the code set a cookie by answering with a redirect", async () => {
    const { door, enter } = await withServer(
      () =>
        new Response(null, {
          status: 302,
          headers: [
            ["Location", "/"],
            ["Set-Cookie", "__Host-slice_app=stolen; Path=/; Secure"],
          ],
        }),
    );
    const { cookie } = await enter("max");
    const response = await door(request("notes", "/api/go", { cookie, headers: called }), "notes");
    expect(response.status).toBe(302);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("never reaches the code for someone who may not open the app", async () => {
    const { door, enter, seen, save } = await withServer();
    const stranger = await enter("sam", "ledger");
    await door(
      request("notes", "/api/items", { cookie: stranger.cookie, headers: called }),
      "notes",
    );
    await door(request("notes", "/api/items", { headers: called }), "notes");
    const { cookie } = await enter("max");
    // Another app's page calling it, a change without the app's own Origin, and an offline app.
    await door(
      request("notes", "/api/items", {
        cookie,
        headers: { ...called, "Sec-Fetch-Site": "same-site" },
      }),
      "notes",
    );
    await door(
      request("notes", "/api/items", {
        cookie,
        method: "POST",
        headers: { Origin: "https://ledger.slice.example" },
        body: "{}",
      }),
      "notes",
    );
    await save("ana-sub", { type: "memberapp.live", id: "notes", version: null });
    await door(request("notes", "/api/items", { cookie, headers: called }), "notes");
    expect(seen).toEqual([]);
  });

  it("answers that there is no server code when the live version has none", async () => {
    const { door, enter, seen, save } = await withServer();
    const { cookie } = await enter("max");
    await save("ana-sub", { type: "memberapp.live", id: "notes", version: 1 });
    const response = await door(
      request("notes", "/api/items", { cookie, headers: called }),
      "notes",
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "This app has no server code." });
    expect(seen).toEqual([]);
  });

  it("says so when the code fails, without passing on what went wrong", async () => {
    const { door, enter } = await withServer(() => {
      throw new Error("D1_ERROR: no such table: secrets");
    });
    const { cookie } = await enter("max");
    const response = await door(
      request("notes", "/api/items", { cookie, headers: called }),
      "notes",
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "This app's server code failed." });
  });

  it("says so while server code is switched off", async () => {
    const { doorWithoutServer, enter } = await withServer();
    const { cookie } = await enter("max");
    const response = await doorWithoutServer(
      request("notes", "/api/items", { cookie, headers: called }),
      "notes",
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "This app's server code is switched off." });
  });

  it("refuses a request body over 1 MB before the code sees it", async () => {
    const { door, enter, seen } = await withServer();
    const { cookie } = await enter("max");
    const response = await door(
      request("notes", "/api/items", {
        cookie,
        method: "POST",
        headers: { Origin: "https://notes.slice.example" },
        body: "x".repeat(1024 * 1024 + 1),
      }),
      "notes",
    );
    expect(response.status).toBe(413);
    expect(seen).toEqual([]);
  });

  it("stops reading a body that does not say how long it is once it passes 1 MB", async () => {
    const { door, enter, seen } = await withServer();
    const { cookie } = await enter("max");
    let sent = 0;
    const chunk = new Uint8Array(64 * 1024);
    // An endless body: the launcher must give up, not wait for the end.
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const response = await door(
      new Request("https://notes.slice.example/api/items", {
        method: "POST",
        headers: { Cookie: cookie, Origin: "https://notes.slice.example" },
        body: endless,
        duplex: "half",
      } as RequestInit),
      "notes",
    );
    expect(response.status).toBe(413);
    expect(seen).toEqual([]);
    expect(sent).toBeLessThan(4 * 1024 * 1024);
  });

  it("never serves the code itself as a file", async () => {
    const { door, enter } = await withServer();
    const { cookie } = await enter("max");
    for (const path of ["/worker.js", "/__server/worker.js", "/%5F%5Fserver/worker.js"])
      expect((await door(request("notes", path, { cookie }), "notes")).status).toBe(404);
  });
});
