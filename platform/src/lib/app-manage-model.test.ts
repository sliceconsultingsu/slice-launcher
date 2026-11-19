import { describe, expect, it } from "vitest";
import type { AppSettings, View } from "../membership/contracts";
import {
  aboutState,
  addManager,
  addPerson,
  candidates,
  displayName,
  extraPowers,
  needsPublicConfirmation,
  publicConfirmation,
  removeManager,
  removePerson,
  setPower,
  toCommand,
} from "./app-manage-model";

const saved: AppSettings = {
  id: "alumni",
  visibility: "private",
  managers: ["max"],
  people: [{ memberId: "ana", powers: ["admin"] }],
};
const members = [
  { id: "ana", name: "Ana Example", title: "Analyst", levelName: "Member" },
  { id: "max", name: "Max Example", title: "", levelName: "Member" },
  { id: "sam", name: "", title: "", levelName: "Member" },
];
function view(overrides: Partial<View> = {}): View {
  return {
    revision: 4,
    organization: "Slice Consulting",
    me: {
      id: "max",
      email: "max@example.test",
      name: "Max Example",
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
    members,
    levels: [],
    catalog: [],
    apps: [
      {
        id: "alumni",
        canOpen: true,
        canManage: true,
        visibility: "private",
        managers: ["Max Example"],
        settings: saved,
      },
    ],
    counts: { active: 3, invited: 108 },
    ...overrides,
  };
}

describe("editing an app's settings", () => {
  it("adds a person with no extra powers, once", () => {
    const draft = addPerson(addPerson(saved, "sam"), "sam");
    expect(draft.people).toEqual([
      { memberId: "ana", powers: ["admin"] },
      { memberId: "sam", powers: [] },
    ]);
    expect(saved.people).toHaveLength(1);
  });

  it("ticks and unticks one person's extra power", () => {
    const on = setPower(saved, "ana", "refresh.run", true);
    expect(on.people[0].powers).toEqual(["admin", "refresh.run"]);
    expect(setPower(on, "ana", "admin", false).people[0].powers).toEqual(["refresh.run"]);
    expect(setPower(saved, "ana", "admin", true)).toEqual(saved);
  });

  it("removes a person, and adds and removes a manager", () => {
    expect(removePerson(saved, "ana").people).toEqual([]);
    expect(addManager(addManager(saved, "ana"), "ana").managers).toEqual(["max", "ana"]);
    expect(removeManager(saved, "max").managers).toEqual([]);
  });

  it("sends the whole settings as one command", () => {
    expect(toCommand({ ...saved, visibility: "public" })).toEqual({
      type: "app.update",
      id: "alumni",
      visibility: "public",
      managers: ["max"],
      people: [{ memberId: "ana", powers: ["admin"] }],
    });
  });

  it("asks before opening a private app to everyone, and only then", () => {
    expect(needsPublicConfirmation(saved, { ...saved, visibility: "public" })).toBe(true);
    expect(needsPublicConfirmation(saved, saved)).toBe(false);
    const open = { ...saved, visibility: "public" as const };
    expect(needsPublicConfirmation(open, open)).toBe(false);
    expect(needsPublicConfirmation(open, saved)).toBe(false);
  });

  it("says how many people making an app public reaches", () => {
    expect(publicConfirmation("Alumni directory", { active: 3, invited: 108 })).toBe(
      "This opens Alumni directory to all 3 active members, and to 108 invited people as they sign in.",
    );
    expect(publicConfirmation("Notes", { active: 1, invited: 1 })).toBe(
      "This opens Notes to 1 active member, and to 1 invited person as they sign in.",
    );
    expect(publicConfirmation("Notes", { active: 2, invited: 0 })).toBe(
      "This opens Notes to all 2 active members.",
    );
  });
});

describe("who a manager can see and pick", () => {
  it("names people from the member list they can already see", () => {
    expect(displayName(view(), "ana")).toBe("Ana Example");
    expect(displayName(view(), "sam")).toBe("Member");
  });

  it("shows someone it cannot see as an invited member, never by ID or address", () => {
    expect(displayName(view(), "ivy-hidden")).toBe("Invited member");
  });

  it("offers members who are not already listed, with an address only if already visible", () => {
    expect(candidates(view(), ["ana", "max"])).toEqual([{ id: "sam", label: "Member" }]);
    const full = view({
      members: [
        {
          ...view().me,
          id: "ivy",
          name: "Member",
          email: "ivy@example.test",
          status: "invited",
          signedIn: false,
        },
      ],
    });
    expect(candidates(full, [])).toEqual([{ id: "ivy", label: "Member (ivy@example.test)" }]);
  });

  it("lists an app's extra powers and leaves out what comes with access", () => {
    expect(
      extraPowers({
        id: "alumni",
        name: "Alumni directory",
        description: "",
        icon: "",
        permissions: [
          { id: "records.read", label: "Browse", withAccess: true },
          { id: "admin", label: "Manage alumni data" },
        ],
      }),
    ).toEqual([{ id: "admin", label: "Manage alumni data" }]);
  });
});

describe("what the app page shows", () => {
  const app = (overrides = {}) => view({ apps: [{ ...view().apps[0], ...overrides }] });

  it("opens for someone who can open or run the app", () => {
    expect(aboutState(view(), "alumni")).toEqual({ kind: "open", app: view().apps[0] });
    expect(aboutState(app({ canOpen: false }), "alumni").kind).toBe("open");
  });

  it("tells an active member without access that the app is private, and who to ask", () => {
    const closed = app({ canOpen: false, canManage: false, settings: undefined });
    expect(aboutState(closed, "alumni")).toEqual({ kind: "private", managers: ["Max Example"] });
  });

  it("sends someone with no profile, or not yet active, to their account", () => {
    expect(aboutState({ needsEnrollment: true }, "alumni")).toEqual({ kind: "inactive" });
    const pending = view({
      me: { ...view().me, status: "pending" },
      apps: [{ ...view().apps[0], canOpen: false, canManage: false, managers: [] }],
    });
    expect(aboutState(pending, "alumni")).toEqual({ kind: "inactive" });
  });

  it("treats an app the view does not mention as private", () => {
    expect(aboutState(view({ apps: [] }), "alumni")).toEqual({ kind: "private", managers: [] });
  });
});
