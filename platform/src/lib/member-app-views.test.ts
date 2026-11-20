import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppView, View } from "../membership/contracts";
import { AboutContent } from "./about-view";
import { AppGridView } from "./app-grid-view";
import { MemberAboutContent, type MemberAboutLoad } from "./member-about-view";
import { memberLauncherApp, memberTiles, waitingForOwner } from "./member-app-model";
import { confirmsPublic } from "./app-manage-model";

const manage = {
  powers: [{ id: "edit", label: "Edit notes" }],
  liveVersion: 2 as number | null,
  preview: null as number | null,
  latest: 2,
  publicApproved: false,
  publicRequestedBy: null as string | null,
};
const settings = {
  id: "notes",
  visibility: "private" as const,
  managers: ["ana"],
  people: [{ memberId: "max", powers: ["edit"] }],
};
function notes(
  overrides: Partial<AppView> = {},
  managing: Partial<typeof manage> | null = {},
): AppView {
  return {
    id: "notes",
    canOpen: true,
    canManage: managing !== null,
    visibility: "private",
    managers: ["Ana Example"],
    ...(managing !== null ? { settings } : {}),
    member: {
      name: "Team notes",
      description: "Notes the team shares.",
      live: true,
      ...(managing !== null ? { manage: { ...manage, ...managing } } : {}),
    },
    ...overrides,
  };
}
function view(apps: AppView[], me: Partial<View["me"]> = {}): View {
  return {
    revision: 7,
    appHost: "slice.example",
    organization: "Slice Consulting",
    me: {
      id: "ana",
      email: "ana@example.test",
      name: "Ana Example",
      title: "",
      status: "active",
      levelId: "member",
      allow: [],
      deny: [],
      owner: false,
      joinedAt: "2026-11-18",
      signedIn: true,
      ...me,
    },
    permissions: [],
    members: [
      { id: "ana", name: "Ana Example", title: "", levelName: "Member" },
      { id: "max", name: "Max Example", title: "", levelName: "Member" },
    ],
    levels: [],
    catalog: [],
    apps,
    counts: { active: 3, invited: 1 },
  };
}
const info = {
  guide: "# Team notes\n\nWrite a note.",
  versions: [
    { version: 2, at: "2026-11-19T12:00:00.000Z", by: "Ana Example" },
    { version: 1, at: "2026-11-18T12:00:00.000Z", by: "Ana Example" },
  ],
};
const page = (load: MemberAboutLoad) =>
  renderToStaticMarkup(
    createElement(MemberAboutContent, {
      appId: "notes",
      load,
      save: () => {},
      reload: () => {},
    }),
  );
const shown = (
  app: AppView | null,
  me: Partial<View["me"]> = {},
  guide: { guide: string; versions?: typeof info.versions } = info,
) => page({ kind: "loaded", view: view(app ? [app] : [], me), info: app ? guide : null });

describe("the launcher grid with apps members made", () => {
  const grid = (apps: AppView[], owner = false) =>
    renderToStaticMarkup(
      createElement(AppGridView, {
        state: {
          kind: "ready",
          apps: [],
          made: memberTiles(apps, "slice.example"),
          waiting: waitingForOwner(apps, owner),
        },
      }),
    );

  it("shows them under their own heading, opening at their own address", () => {
    const html = grid([notes({}, null)]);
    expect(html).toContain("Made by members");
    expect(html).toContain('href="https://notes.slice.example"');
    expect(html).toContain('href="/about/notes"');
    expect(html).toContain("Team notes");
    expect(html).not.toContain("No apps have been shared with you yet.");
  });

  it("marks an offline app instead of offering to open it", () => {
    const html = grid([
      notes({ member: { name: "Team notes", description: "", live: false } }, null),
    ]);
    expect(html).toContain("Offline");
    expect(html).not.toContain('href="https://notes.slice.example"');
    expect(html).not.toContain("Coming soon");
  });

  it("tells an owner which apps are waiting for their OK", () => {
    const html = grid([notes({}, { publicRequestedBy: "Ana Example" })], true);
    expect(html).toContain("Waiting for your OK to be Public");
    expect(html).toContain("Ana Example");
    expect(grid([notes({}, { publicRequestedBy: "Ana Example" })], false)).not.toContain(
      "Waiting for your OK",
    );
  });

  it("still says nothing has been shared when there are no apps of either kind", () => {
    const html = renderToStaticMarkup(
      createElement(AppGridView, { state: { kind: "ready", apps: [], made: [] } }),
    );
    expect(html).toContain("No apps have been shared with you yet.");
    expect(html).not.toContain("Made by members");
  });
});

describe("the app page, told where Open goes", () => {
  const app = memberLauncherApp(notes())!;
  const html = (openHref: string | null) =>
    renderToStaticMarkup(
      createElement(AboutContent, {
        app,
        guide: createElement("p", null, "Write a note."),
        load: { kind: "loaded", view: view([notes()]) },
        save: () => {},
        reload: () => {},
        openHref,
        children: createElement("p", null, "More for the people who run it."),
      }),
    );

  it("opens a member app at its own address", () => {
    expect(html("https://notes.slice.example")).toContain('href="https://notes.slice.example"');
    expect(html("https://notes.slice.example")).not.toContain('href="/apps/notes"');
  });

  it("offers no way in while the app is offline", () => {
    expect(html(null)).not.toContain(">Open<");
  });

  it("shows the extra section only below the settings of someone who runs it", () => {
    expect(html(null)).toContain("More for the people who run it.");
  });
});

describe("a member app's page", () => {
  it("shows someone on the app its guide and the way in, and nothing to manage", () => {
    const html = shown(notes({}, null), { id: "max", name: "Max Example" }, { guide: info.guide });
    expect(html).toContain("<h1>Team notes</h1>");
    expect(html).toContain("Write a note.");
    expect(html).toContain('href="https://notes.slice.example"');
    expect(html).toContain("Run by Ana Example");
    expect(html).not.toContain("Manage this app");
    expect(html).not.toContain("Take offline");
  });

  it("shows the people who run it its settings, its versions and what they can do", () => {
    const html = shown(notes());
    expect(html).toContain("Manage this app");
    expect(html).toContain("Edit notes");
    expect(html).toContain("Version 2 is live");
    expect(html).toContain("https://notes.slice.example");
    expect(html).toContain("Take offline");
    expect(html).toContain("Delete this app");
    expect(html).toContain("Version 1");
    expect(html).toContain("Make version 1 live");
    expect(html).not.toContain("Make version 2 live");
    expect(html).toContain("needs the Slice owner&#x27;s OK");
  });

  it("says an offline app is offline and offers to put its latest version back", () => {
    const html = shown(
      notes({
        member: {
          name: "Team notes",
          description: "",
          live: false,
          manage: { ...manage, liveVersion: null },
        },
      }),
    );
    expect(html).toContain("Offline. Nobody can open it.");
    expect(html).toContain("Make version 2 live");
    expect(html).not.toContain("Take offline");
    expect(html).not.toContain(">Open<");
  });

  it("shows a preview with the ways to make it live or discard it", () => {
    const html = shown(notes({}, { liveVersion: 1, preview: 2 }));
    expect(html).toContain("Version 1 is live");
    expect(html).toContain("Version 2 is a preview");
    expect(html).toContain("Only the people who run this app see it");
    expect(html).toContain("Make version 2 live");
    expect(html).toContain("Discard preview");
    expect(html).toContain("· Preview");
  });

  it("lets a manager open a draft that has never been live", () => {
    const html = shown(
      notes({
        member: {
          name: "Team notes",
          description: "",
          live: false,
          manage: { ...manage, liveVersion: null, preview: 1, latest: 1 },
        },
      }),
    );
    expect(html).toContain("Version 1 is a preview");
    expect(html).toContain('href="https://notes.slice.example"');
    expect(html).not.toContain("Take offline");
  });

  it("tells a manager who has never published what to do next", () => {
    const html = shown(
      notes({
        member: {
          name: "Team notes",
          description: "",
          live: false,
          manage: { ...manage, liveVersion: null, latest: 0 },
        },
      }),
      {},
      { guide: "", versions: [] },
    );
    expect(html).toContain("Nothing has been published yet.");
    expect(html).toContain("slice_app_publish");
  });

  it("tells a manager their request is waiting, and an owner how to agree", () => {
    const waiting = notes({}, { publicRequestedBy: "Ana Example" });
    expect(shown(waiting)).toContain("Waiting for the Slice owner&#x27;s OK");
    const owner = shown(waiting, { id: "owner", name: "Owner", owner: true });
    expect(owner).toContain("Ana Example asked for this");
  });

  it("tells someone on an offline app that it is offline", () => {
    const html = shown(
      notes({ member: { name: "Team notes", description: "", live: false } }, null),
      { id: "max" },
      { guide: "" },
    );
    expect(html).toContain("This app is offline.");
    expect(html).not.toContain(">Open<");
  });

  it("says the same for an app someone is not on as for one that does not exist", () => {
    const html = shown(null, { id: "sam" });
    expect(html).toContain("There is no app here that you can open.");
    expect(html).not.toContain("Team notes");
  });

  it("offers sign-in to a visitor, sends an inactive person to their account, and reports a failure", () => {
    expect(page({ kind: "signed-out" })).toContain("Sign in with Google");
    expect(page({ kind: "loaded", view: { needsEnrollment: true }, info: null })).toContain(
      'href="/account"',
    );
    expect(page({ kind: "failed", message: "This page could not be loaded." })).toContain(
      "This page could not be loaded.",
    );
    expect(page({ kind: "loading" })).toContain('aria-busy="true"');
  });
});

describe("asking before a member app is opened to everyone", () => {
  const saved = settings;
  const draft = { ...settings, visibility: "public" as const };
  it("asks when the save opens it, and not when the save only asks the owner", () => {
    expect(confirmsPublic(saved, draft, "free")).toBe(true);
    expect(confirmsPublic(saved, draft, "approve")).toBe(true);
    expect(confirmsPublic(saved, draft, "ask")).toBe(false);
    expect(confirmsPublic(saved, saved, "free")).toBe(false);
  });
});
