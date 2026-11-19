import { describe, expect, it } from "vitest";
import type { AppDescriptor } from "../platform/contracts";
import { appPermissions, managesApp, settingsFor } from "./app-access";
import type { AppSettings, Member, State } from "./contracts";
import { effectivePermissions } from "./domain";

// Two invented apps. Notes hands "read" to everyone who can open it; "admin" is an extra power.
const notes: AppDescriptor = {
  id: "notes",
  name: "Notes",
  description: "",
  permissions: [
    { id: "read", label: "Read notes", withAccess: true },
    { id: "admin", label: "Manage notes" },
  ],
};
const ledger: AppDescriptor = {
  id: "ledger",
  name: "Ledger",
  description: "",
  permissions: [{ id: "post", label: "Post entries" }],
};
const catalog = [notes, ledger];

function member(id: string, overrides: Partial<Member> = {}): Member {
  return {
    id,
    subject: `sub-${id}`,
    email: `${id}@example.test`,
    name: id,
    title: "",
    status: "active",
    levelId: "member",
    allow: [],
    deny: [],
    owner: false,
    joinedAt: "2026-11-18",
    ...overrides,
  };
}
function state(apps: AppSettings[], members: Member[], levels = [basic]): State {
  return { revision: 0, ownerEmail: null, ownerClaimed: true, members, levels, apps };
}
const basic = { id: "member", name: "Member", permissions: ["members.read"] };
const settings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  id: "notes",
  visibility: "private",
  managers: [],
  people: [],
  ...overrides,
});
const appOnly = (permissions: string[]) => permissions.filter((p) => p.startsWith("app."));

describe("who can open an app", () => {
  it("treats an app with no saved settings as private and empty", () => {
    expect(settingsFor(state([], []), "notes")).toEqual(settings());
  });

  it("gives an unlisted member nothing in a private app", () => {
    const ana = member("ana");
    expect(appPermissions(state([settings()], [ana]), ana, notes)).toEqual([]);
  });

  it("gives a listed member the app and what comes with access", () => {
    const ana = member("ana");
    const s = state([settings({ people: [{ memberId: "ana", powers: [] }] })], [ana]);
    expect(appPermissions(s, ana, notes).sort()).toEqual(["app.notes.open", "app.notes.read"]);
  });

  it("adds the extra powers a listed member was given", () => {
    const ana = member("ana");
    const s = state([settings({ people: [{ memberId: "ana", powers: ["admin"] }] })], [ana]);
    expect(appPermissions(s, ana, notes).sort()).toEqual([
      "app.notes.admin",
      "app.notes.open",
      "app.notes.read",
    ]);
  });

  it("opens a public app to every active member, without extra powers", () => {
    const ana = member("ana");
    const s = state([settings({ visibility: "public" })], [ana]);
    expect(appPermissions(s, ana, notes).sort()).toEqual(["app.notes.open", "app.notes.read"]);
  });

  it("lets someone hold an extra power in a public app", () => {
    const ana = member("ana");
    const s = state(
      [settings({ visibility: "public", people: [{ memberId: "ana", powers: ["admin"] }] })],
      [ana],
    );
    expect(appPermissions(s, ana, notes)).toContain("app.notes.admin");
  });
});

describe("who runs an app", () => {
  it("gives a manager every permission of their app and nothing in another", () => {
    const max = member("max");
    const s = state([settings({ managers: ["max"] })], [max]);
    expect(managesApp(s, max, "notes")).toBe(true);
    expect(managesApp(s, max, "ledger")).toBe(false);
    expect(appOnly(effectivePermissions(s, max, catalog))).toEqual([
      "app.notes.admin",
      "app.notes.open",
      "app.notes.read",
    ]);
  });

  it("gives an owner every permission of every app", () => {
    const olu = member("olu", { owner: true });
    const s = state([], [olu]);
    expect(managesApp(s, olu, "ledger")).toBe(true);
    expect(effectivePermissions(s, olu, catalog)).toEqual([
      "app.ledger.open",
      "app.ledger.post",
      "app.notes.admin",
      "app.notes.open",
      "app.notes.read",
      "audit.read",
      "levels.manage",
      "members.manage",
      "members.read",
    ]);
  });

  it.each(["pending", "invited", "suspended"] as const)(
    "gives a %s person nothing, listed or managing",
    (status) => {
      const sam = member("sam", { status });
      const s = state(
        [
          settings({
            visibility: "public",
            managers: ["sam"],
            people: [{ memberId: "sam", powers: ["admin"] }],
          }),
        ],
        [sam],
      );
      expect(managesApp(s, sam, "notes")).toBe(false);
      expect(effectivePermissions(s, sam, catalog)).toEqual([]);
    },
  );

  it("gives a suspended owner no say over an app", () => {
    const olu = member("olu", { owner: true, status: "suspended" });
    expect(managesApp(state([], [olu]), olu, "notes")).toBe(false);
  });
});

describe("one place to set app access", () => {
  it("ignores app permissions left on a level or a member", () => {
    const ana = member("ana", { levelId: "old", allow: ["app.notes.admin", "app.ledger.post"] });
    const old = { id: "old", name: "Old", permissions: ["members.read", "app.notes.open"] };
    const s = state([settings()], [ana], [old]);
    expect(effectivePermissions(s, ana, catalog)).toEqual(["members.read"]);
  });

  it("does not let an individual revoke keep someone out of a public app", () => {
    const ana = member("ana", { deny: ["app.notes.open", "app.notes.read"] });
    const s = state([settings({ visibility: "public" })], [ana]);
    expect(appOnly(effectivePermissions(s, ana, catalog))).toEqual([
      "app.notes.open",
      "app.notes.read",
    ]);
  });

  it("still takes organization permissions from level, allow and revoke", () => {
    const admin = { id: "admin", name: "Admin", permissions: ["members.read", "members.manage"] };
    const ana = member("ana", { levelId: "admin", allow: ["audit.read"], deny: ["members.read"] });
    const s = state([], [ana], [admin]);
    expect(effectivePermissions(s, ana, catalog)).toEqual(["audit.read", "members.manage"]);
  });
});

describe("settings that have gone stale", () => {
  it("grants nothing for a power the app no longer declares, or for open", () => {
    const ana = member("ana");
    const s = state(
      [settings({ people: [{ memberId: "ana", powers: ["retired", "open", "read"] }] })],
      [ana],
    );
    expect(appPermissions(s, ana, notes).sort()).toEqual(["app.notes.open", "app.notes.read"]);
  });

  it("works out access when settings name a member who is gone", () => {
    const ana = member("ana");
    const s = state(
      [settings({ managers: ["gone"], people: [{ memberId: "gone", powers: ["admin"] }] })],
      [ana],
    );
    expect(effectivePermissions(s, ana, catalog)).toEqual(["members.read"]);
  });

  it("ignores settings for an app that is not in the catalog", () => {
    const ana = member("ana");
    const s = state([settings({ id: "retired", visibility: "public", managers: ["ana"] })], [ana]);
    expect(effectivePermissions(s, ana, catalog)).toEqual(["members.read"]);
  });
});
