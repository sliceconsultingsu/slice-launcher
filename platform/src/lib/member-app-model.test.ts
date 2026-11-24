import { describe, expect, it } from "vitest";
import type { AppSettings, AppView } from "../membership/contracts";
import { startingDraft } from "./app-manage-model";
import {
  memberLauncherApp,
  memberTiles,
  publicNote,
  publicRule,
  waitingForOwner,
} from "./member-app-model";

const manage = {
  powers: [{ id: "edit", label: "Edit notes" }],
  liveVersion: 1,
  preview: null as number | null,
  latest: 1,
  publicApproved: false,
  publicRequestedBy: null as string | null,
};
const told = (id: string, overrides: Partial<AppView> = {}): AppView => ({
  id,
  canOpen: true,
  canManage: false,
  visibility: "private",
  managers: ["Ana"],
  member: { name: `${id} app`, description: `About ${id}`, live: true },
  ...overrides,
});
const builtIn: AppView = {
  id: "alumni",
  canOpen: true,
  canManage: true,
  visibility: "public",
  managers: [],
};

describe("tiles for apps members made", () => {
  it("links a live app to its own address and to its page in the launcher", () => {
    const tiles = memberTiles([builtIn, told("notes")], "slice.example");
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({
      app: { id: "notes", name: "notes app", description: "About notes" },
      isPrivate: true,
      href: "https://notes.slice.example",
    });
    expect(tiles[0].app.icon).toMatch(/^\/brand\/.+\.svg$/);
  });

  it("shows an offline app without a way to open it", () => {
    const [tile] = memberTiles(
      [told("notes", { member: { name: "Notes", description: "", live: false } })],
      "slice.example",
    );
    expect(tile).toMatchObject({ href: null, unavailable: "Offline" });
  });

  it("lets the people who run an app open its preview before anything is live", () => {
    const draft = told("notes", {
      canManage: true,
      member: {
        name: "Notes",
        description: "",
        live: false,
        manage: { ...manage, liveVersion: null, preview: 1 },
      },
    });
    expect(memberTiles([draft], "slice.example")[0]).toMatchObject({
      href: "https://notes.slice.example",
    });
    expect(memberTiles([draft], "slice.example")[0]).not.toHaveProperty("unavailable");
  });

  it("shows nothing while member apps are switched off", () => {
    expect(memberTiles([told("notes")], null)).toEqual([]);
  });

  it("sorts by name", () => {
    const tiles = memberTiles(
      [
        told("b", { member: { name: "Zebra", description: "", live: true } }),
        told("a", { member: { name: "apple", description: "", live: true } }),
      ],
      "slice.example",
    );
    expect(tiles.map((tile) => tile.app.name)).toEqual(["apple", "Zebra"]);
  });

  it("lists for an owner the apps waiting for their OK", () => {
    const apps = [
      told("notes", {
        canManage: true,
        member: {
          name: "Notes",
          description: "",
          live: true,
          manage: { ...manage, publicRequestedBy: "Ana" },
        },
      }),
      told("ledger", {
        canManage: true,
        member: { name: "Ledger", description: "", live: true, manage },
      }),
    ];
    expect(waitingForOwner(apps, true)).toEqual([{ id: "notes", name: "Notes", by: "Ana" }]);
    expect(waitingForOwner(apps, false)).toEqual([]);
  });
});

describe("a member app on its page", () => {
  it("is described like a built-in app, with its powers as its permissions", () => {
    const app = memberLauncherApp(
      told("notes", {
        canManage: true,
        member: { name: "Notes", description: "Shared notes.", live: true, manage },
      }),
    );
    expect(app).toMatchObject({
      id: "notes",
      name: "Notes",
      description: "Shared notes.",
      permissions: [{ id: "edit", label: "Edit notes" }],
    });
    expect(memberLauncherApp(builtIn)).toBeNull();
  });
});

describe("making a member app Public", () => {
  const app = (overrides: Partial<typeof manage>, canManage = true) =>
    told("notes", {
      canManage,
      member: { name: "Notes", description: "", live: true, manage: { ...manage, ...overrides } },
    });

  it("is free for a built-in app and for a member app an owner has approved", () => {
    expect(publicRule(builtIn, false)).toBe("free");
    expect(publicRule(app({ publicApproved: true }), false)).toBe("free");
    expect(publicRule(app({ publicApproved: true }), true)).toBe("free");
  });

  it("is a request from a manager and an approval from an owner", () => {
    expect(publicRule(app({}), false)).toBe("ask");
    expect(publicRule(app({}), true)).toBe("approve");
  });

  it("says under Public what saving will do", () => {
    expect(publicNote("free", null)).toBe("Every active member of Slice");
    expect(publicNote("ask", null)).toMatch(/needs the Slice owner's OK/);
    expect(publicNote("ask", "Ana")).toMatch(/Waiting for the Slice owner's OK/);
    expect(publicNote("approve", "Ana")).toMatch(/Ana asked for this/);
    expect(publicNote("approve", null)).toMatch(/Every active member of Slice/);
  });

  it("keeps a pending request when its manager saves something else", () => {
    const settings: AppSettings = { id: "notes", visibility: "private", managers: [], people: [] };
    const launcherApp = memberLauncherApp(app({ publicRequestedBy: "Ana" }))!;
    // The form starts on Public while a request is waiting, so saving again asks again.
    expect(startingDraft(settings, launcherApp, true).visibility).toBe("public");
    expect(startingDraft(settings, launcherApp, false).visibility).toBe("private");
    expect(startingDraft(settings, launcherApp).visibility).toBe("private");
  });
});
