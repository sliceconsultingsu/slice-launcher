import { describe, expect, it } from "vitest";
import type { AppView, View } from "../membership/contracts";
import { appIdProblem } from "../member-apps/rules";
import { briefFor, myApps, suggestId } from "./model";

const manage = {
  powers: [],
  liveVersion: null as number | null,
  preview: null as number | null,
  latest: 0,
  publicApproved: false,
  publicRequestedBy: null as string | null,
  brief: null as { audience: "me" | "team" | "everyone"; saves: boolean } | null,
};
const app = (
  id: string,
  managing: Partial<typeof manage> = {},
  overrides: Partial<AppView> = {},
): AppView => ({
  id,
  canOpen: true,
  canManage: true,
  visibility: "private",
  managers: ["Ana Example"],
  settings: { id, visibility: "private", managers: ["ana"], people: [] },
  member: {
    name: `${id} app`,
    description: `What ${id} is for.`,
    live: (managing.liveVersion ?? null) !== null,
    manage: { ...manage, ...managing },
  },
  ...overrides,
});
const view = (apps: AppView[], me = "ana"): View => ({
  revision: 3,
  organization: "Slice Consulting",
  me: {
    id: me,
    email: `${me}@example.test`,
    name: "Ana Example",
    title: "",
    status: "active",
    levelId: "member",
    allow: [],
    deny: [],
    owner: false,
    joinedAt: "2026-11-18",
    signedIn: true,
  },
  permissions: [],
  members: [],
  levels: [],
  catalog: [],
  apps,
  appHost: "slice.example",
  making: { used: apps.length, most: 5, saves: false },
});

describe("where each of a person's apps stands", () => {
  it("calls an app nothing has been published to a draft, waiting for their AI", () => {
    expect(myApps(view([app("notes")]))).toEqual([
      {
        id: "notes",
        name: "notes app",
        purpose: "What notes is for.",
        stage: "draft",
        line: "Waiting for your AI to publish a first preview.",
        address: "https://notes.slice.example",
        preview: null,
        brief: null,
      },
    ]);
  });

  it("says a preview is ready, and what everyone else still gets", () => {
    const [first] = myApps(view([app("notes", { latest: 1, preview: 1 })]));
    expect(first).toMatchObject({
      stage: "preview",
      preview: 1,
      line: "Version 1 is a preview only the people who run it can see.",
    });
    const [later] = myApps(view([app("notes", { latest: 3, preview: 3, liveVersion: 2 })]));
    expect(later.line).toBe("Version 3 is a preview. Everyone else still gets version 2.");
  });

  it("says who a live app reaches", () => {
    const live = { latest: 2, liveVersion: 2 };
    const line = (overrides: Partial<AppView> = {}) =>
      myApps(view([app("notes", live, overrides)]))[0];
    expect(line()).toMatchObject({
      stage: "live",
      line: "Version 2 is live, and private to the people who run it.",
    });
    const shared = (count: number) => ({
      settings: {
        id: "notes",
        visibility: "private" as const,
        managers: ["ana"],
        people: Array.from({ length: count }, (_, n) => ({ memberId: `m${n}`, powers: [] })),
      },
    });
    expect(line(shared(1)).line).toBe("Version 2 is live, shared with 1 person.");
    expect(line(shared(4)).line).toBe("Version 2 is live, shared with 4 people.");
    expect(line({ visibility: "public" }).line).toBe("Version 2 is live for every member.");
  });

  it("says an app taken offline is offline", () => {
    expect(myApps(view([app("notes", { latest: 2 })]))[0]).toMatchObject({
      stage: "offline",
      line: "Offline. Nobody can open it.",
    });
  });

  it("puts the earliest stage first, then sorts by name", () => {
    const apps = [
      app("zeta", { latest: 1, liveVersion: 1 }),
      app("beta", { latest: 1 }),
      app("delta", { latest: 1, preview: 1 }),
      app("gamma"),
      app("alpha"),
    ];
    expect(myApps(view(apps)).map((item) => `${item.id}:${item.stage}`)).toEqual([
      "alpha:draft",
      "gamma:draft",
      "delta:preview",
      "zeta:live",
      "beta:offline",
    ]);
  });

  it("lists only apps the person is named as running, not every app an owner can manage", () => {
    const theirs = app(
      "theirs",
      {},
      {
        settings: { id: "theirs", visibility: "private", managers: ["max"], people: [] },
      },
    );
    const builtIn: AppView = {
      id: "alumni",
      canOpen: true,
      canManage: true,
      visibility: "public",
      managers: [],
      settings: { id: "alumni", visibility: "public", managers: ["ana"], people: [] },
    };
    const onIt = app(
      "shared",
      { latest: 1, liveVersion: 1 },
      { canManage: false, settings: undefined },
    );
    delete onIt.member!.manage;
    expect(myApps(view([app("mine"), theirs, builtIn, onIt])).map((item) => item.id)).toEqual([
      "mine",
    ]);
  });

  it("has no address to give while member apps are off", () => {
    expect(myApps({ ...view([app("notes")]), appHost: null })[0].address).toBeNull();
  });
});

describe("the address a name suggests", () => {
  it.each([
    ["Kickoff checklist", "kickoff-checklist"],
    ["  Rate Calculator (v2)!  ", "rate-calculator-v2"],
    ["2026 planning", "planning"],
    ["Café résumé", "cafe-resume"],
    ["A", "a"],
    ["!!!", ""],
    ["An extremely long name that goes on well past the limit", "an-extremely-long-name-that-goes"],
    ["Thirty-one characters and then - a break", "thirty-one-characters-and-then-a"],
  ])("%s becomes %s", (name, id) => {
    expect(suggestId(name)).toBe(id);
  });

  it("never suggests something the launcher would refuse for its shape, once it is long enough", () => {
    for (const name of ["Kickoff checklist", "Rate Calculator (v2)!", "Q4 -- review", "x-1"])
      expect(appIdProblem(suggestId(name), [])).toBeNull();
  });
});

describe("the brief that hands an app to a member's AI", () => {
  const started = {
    id: "kickoff-checklist",
    name: "Kickoff checklist",
    purpose: "A checklist for kicking off a new client project.",
    brief: { audience: "team" as const, saves: false },
  };

  it("names the app that already exists, so the AI publishes to it and does not create another", () => {
    const brief = briefFor(started, { saves: false });
    for (const fact of [
      "App ID: kickoff-checklist",
      "Name: Kickoff checklist",
      "What it should help with: A checklist for kicking off a new client project.",
      "Who it is for: my project team",
      "it does not need to remember anything between visits",
      "slice_app_guide",
      "Do not call slice_app_create",
      '"preview": true',
      "one question at a time",
      "open the Build page on Slice",
    ])
      expect(brief).toContain(fact);
  });

  it("says plainly when the member wants saved data and apps cannot save any yet", () => {
    const wants = { ...started, brief: { audience: "everyone" as const, saves: true } };
    const off = briefFor(wants, { saves: false });
    expect(off).toContain("Slice apps cannot do that yet");
    expect(off).toContain("which needs the Slice owner's OK");
    const on = briefFor(wants, { saves: true });
    expect(on).toContain("it needs to remember what people enter");
    expect(on).not.toContain("cannot do that yet");
  });

  it("leaves out what was never asked, for an app an AI created", () => {
    const brief = briefFor({ ...started, brief: null }, { saves: false });
    expect(brief).toContain("App ID: kickoff-checklist");
    expect(brief).not.toContain("Who it is for");
    expect(brief).not.toContain("Saved data");
  });
});
