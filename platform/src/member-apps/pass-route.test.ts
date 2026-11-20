import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { database, migrate, reset } from "../../tests/database";
import { applyCommand, enroll } from "../membership/domain";
import { Repository } from "../membership/repository";
import { createSession } from "../membership/session";
import { appIdentity, APP_COOKIE, redeemPass, STATE_COOKIE } from "./app-sessions";
import { passRequest } from "./pass-route";

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

const who = (name: string) => ({
  subject: `${name}-sub`,
  email: `${name}@example.test`,
  emailManaged: true,
});
/** Ana runs the live app "notes" and has added Max; Sam is active but not on it; Pia is pending. */
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
    const joined = enroll(state, who(name), { id: `${name}-member`, now: "2026-11-19T09:00:00Z" });
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
  const app = { name: "Notes", description: "Shared notes." };
  await save("ana-sub", { type: "memberapp.create", id: "notes", ...app });
  await save("ana-sub", { type: "memberapp.publish", id: "notes", ...app, powers: [] });
  await save("ana-sub", {
    type: "app.update",
    id: "notes",
    visibility: "private",
    managers: ["ana-member"],
    people: [{ memberId: "max-member", powers: [] }],
  });
  return { repository, save };
}
const STATE = "s".repeat(43);
async function ask(
  name: string | null,
  asked: string,
  options: { enabled?: boolean; method?: string; state?: string | null } = {},
) {
  // The app's address sends the browser here with the state it made for it.
  const state = options.state === undefined ? STATE : options.state;
  const query = state === null ? asked : `${asked}${asked ? "&" : "?"}state=${state}`;
  const repository = new Repository(fixture.db);
  const headers: Record<string, string> = {};
  if (name) {
    const setCookie = await createSession(fixture.db, who(name), "test browser");
    headers.Cookie = setCookie.split(";")[0];
  }
  return passRequest(
    new Request(`https://slice.example/api/app-pass${query}`, {
      method: options.method ?? "GET",
      headers,
    }),
    {
      db: fixture.db,
      loadState: () => repository.load(),
      origin: "https://slice.example",
      enabled: options.enabled ?? true,
    },
  );
}
const where = (response: Response) => response.headers.get("Location") ?? "";

describe("carrying a signed-in person to a member app", () => {
  it("sends someone on the app to it with a pass that signs them in there", async () => {
    await setup();
    const response = await ask("max", "?app=notes&next=%2Fpage.html%3Ftab%3D2");
    expect(response.status).toBe(302);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    const target = new URL(where(response));
    expect(target.origin).toBe("https://notes.slice.example");
    expect(target.pathname).toBe("/__slice/session");
    expect(target.searchParams.get("next")).toBe("/page.html?tab=2");
    const setCookie = await redeemPass(
      fixture.db,
      "notes",
      target.searchParams.get("pass") ?? "",
      new Request("https://notes.slice.example/__slice/session", {
        headers: { Cookie: `${STATE_COOKIE}=${STATE}` },
      }),
    );
    const atApp = new Request("https://notes.slice.example/", {
      headers: { Cookie: `${APP_COOKIE}=${setCookie!.split(";")[0].split("=")[1]}` },
    });
    expect(await appIdentity(fixture.db, "notes", atApp)).toMatchObject({ subject: "max-sub" });
  });

  it("lets the app's manager and an owner through", async () => {
    await setup();
    expect(where(await ask("ana", "?app=notes"))).toContain("https://notes.slice.example/");
    expect(where(await ask("owner", "?app=notes"))).toContain("https://notes.slice.example/");
  });

  it("sends someone who is not on the app to its page in the launcher, with no pass", async () => {
    await setup();
    const response = await ask("sam", "?app=notes");
    expect(response.status).toBe(302);
    expect(where(response)).toBe("/about/notes");
    expect(await fixture.db.prepare("SELECT COUNT(*) AS n FROM app_passes").first()).toEqual({
      n: 0,
    });
  });

  it("sends someone who is not an active member to their account", async () => {
    const { save } = await setup();
    expect(where(await ask("pia", "?app=notes"))).toBe("/account");
    await save("owner-sub", {
      type: "member.update",
      id: "max-member",
      status: "suspended",
      levelId: "member",
      allow: [],
      deny: [],
      owner: false,
    });
    expect(where(await ask("max", "?app=notes"))).toBe("/account");
    expect(where(await ask("stranger", "?app=notes"))).toBe("/account");
  });

  it("sends a signed-out browser to sign in and back here", async () => {
    await setup();
    const response = await ask(null, "?app=notes&next=%2Fpage.html");
    expect(response.status).toBe(302);
    // The state is left behind: signing in can take longer than it lasts.
    expect(where(response)).toBe(
      `/api/auth/google/start?next=${encodeURIComponent("/api/app-pass?app=notes&next=%2Fpage.html")}`,
    );
  });

  it.each([null, "", "short", "s".repeat(44)])(
    "sends a browser that arrives without a usable state (%j) to the app's address to start there",
    async (state) => {
      await setup();
      const response = await ask("max", "?app=notes&next=%2Fpage.html", { state });
      expect(response.status).toBe(302);
      expect(where(response)).toBe("https://notes.slice.example/page.html");
      expect(await fixture.db.prepare("SELECT COUNT(*) AS n FROM app_passes").first()).toEqual({
        n: 0,
      });
    },
  );

  it("gives no pass for an app that is offline, even to its manager", async () => {
    const { save } = await setup();
    await save("ana-sub", { type: "memberapp.live", id: "notes", version: null });
    expect(where(await ask("ana", "?app=notes"))).toBe("/about/notes");
    expect(where(await ask("max", "?app=notes"))).toBe("/about/notes");
  });

  it("gives the people who run an app a pass to its preview while nothing is live", async () => {
    const { save } = await setup();
    await save("ana-sub", { type: "memberapp.live", id: "notes", version: null });
    await save("ana-sub", {
      type: "memberapp.publish",
      id: "notes",
      name: "Notes",
      description: "Shared notes.",
      powers: [],
      preview: true,
    });
    expect(where(await ask("ana", "?app=notes"))).toContain("https://notes.slice.example/");
    expect(where(await ask("owner", "?app=notes"))).toContain("https://notes.slice.example/");
    expect(where(await ask("max", "?app=notes"))).toBe("/about/notes");
  });

  it.each(["?app=nowhere", "?app=alumni", "?app=Notes", "?app=", "?", "?app=../notes"])(
    "answers 404 for %j",
    async (query) => {
      await setup();
      expect((await ask("ana", query)).status).toBe(404);
    },
  );

  it("answers 404 for a deleted app", async () => {
    const { save } = await setup();
    await save("ana-sub", { type: "memberapp.delete", id: "notes" });
    expect((await ask("ana", "?app=notes")).status).toBe(404);
  });

  it.each([
    "//evil.example/x",
    "https://evil.example/x",
    "/\\evil.example",
    "page.html",
    "/__slice/session?pass=x",
    `/${"x".repeat(2100)}`,
    "/a\nb",
  ])("starts at the app's first screen when asked to continue to %j", async (next) => {
    await setup();
    const target = new URL(where(await ask("max", `?app=notes&next=${encodeURIComponent(next)}`)));
    expect(target.origin).toBe("https://notes.slice.example");
    expect(target.searchParams.get("next")).toBe("/");
  });

  it("answers 404 while member apps are switched off, and refuses anything but a page load", async () => {
    await setup();
    expect((await ask("max", "?app=notes", { enabled: false })).status).toBe(404);
    const posted = await ask("max", "?app=notes", { method: "POST" });
    expect(posted.status).toBe(405);
    expect(await fixture.db.prepare("SELECT COUNT(*) AS n FROM app_passes").first()).toEqual({
      n: 0,
    });
  });
});
