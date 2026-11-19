import { describe, expect, it } from "vitest";
import { applyCommand, emptyState, enroll, memberView } from "./domain";
import type { State } from "./contracts";

// What the browser is told about apps: enough to draw each person's launcher and app page, and
// the full settings only for the apps they run.
const meta = { id: "event-1", now: "2026-11-18T12:00:00Z" };
const next = () => ({ ...meta, id: crypto.randomUUID() });
const identity = (name: string) => ({
  subject: `${name}-sub`,
  email: `${name}@example.test`,
  emailManaged: true,
});
function act(state: State, command: unknown, actor = "owner") {
  return applyCommand(state, `${actor}-sub`, command, next()).state;
}
/** An owner, active members Ana and Max, a pending Pat and an invited Ivy. */
function organization() {
  let state = enroll(emptyState("owner@example.test"), identity("owner"), meta).state;
  const ids: Record<string, string> = {};
  for (const name of ["ana", "max", "pat"]) {
    state = enroll(state, identity(name), next()).state;
    ids[name] = state.members.find((m) => m.subject === `${name}-sub`)!.id;
    if (name === "pat") continue;
    state = act(state, { type: "profile.update", name: `${name} Example`, title: "" }, name);
    state = act(state, {
      type: "member.update",
      id: ids[name],
      status: "active",
      levelId: "member",
      allow: [],
      deny: [],
      owner: false,
    });
  }
  state = act(state, {
    type: "member.add",
    email: "ivy@example.test",
    name: "Ivy Example",
    levelId: "member",
  });
  ids.ivy = state.members.find((m) => m.email === "ivy@example.test")!.id;
  return { state, ids };
}
const settings = (overrides: Record<string, unknown> = {}) => ({
  type: "app.update",
  id: "alumni",
  visibility: "private",
  managers: [],
  people: [],
  ...overrides,
});
const alumni = (state: State, name: string) =>
  memberView(state, `${name}-sub`).apps.find((app) => app.id === "alumni")!;

describe("what each person is told about an app", () => {
  it("lists every catalog app, closed by default to everyone but owners", () => {
    const { state } = organization();
    expect(alumni(state, "ana")).toEqual({
      id: "alumni",
      canOpen: false,
      canManage: false,
      visibility: "private",
      managers: [],
    });
    expect(alumni(state, "owner")).toMatchObject({ canOpen: true, canManage: true });
  });

  it("tells a member they can open an app they were added to, and who runs it", () => {
    const { state, ids } = organization();
    const s = act(
      state,
      settings({ managers: [ids.max], people: [{ memberId: ids.ana, powers: ["admin"] }] }),
    );
    const view = memberView(s, "ana-sub");
    expect(alumni(s, "ana")).toEqual({
      id: "alumni",
      canOpen: true,
      canManage: false,
      visibility: "private",
      managers: ["max Example"],
    });
    expect(view.counts).toBeUndefined();
    expect(view.permissions).toContain("app.alumni.admin");
  });

  it("gives the people who run an app its settings and the size of Slice", () => {
    const { state, ids } = organization();
    const s = act(state, settings({ managers: [ids.max] }));
    const view = memberView(s, "max-sub");
    expect(alumni(s, "max")).toEqual({
      id: "alumni",
      canOpen: true,
      canManage: true,
      visibility: "private",
      managers: ["max Example"],
      settings: { id: "alumni", visibility: "private", managers: [ids.max], people: [] },
    });
    // The owner, Ana and Max are active; Ivy is invited; Pat is pending and counted in neither.
    expect(view.counts).toEqual({ active: 3, invited: 1 });
    expect(memberView(s, "owner-sub").counts).toEqual({ active: 3, invited: 1 });
  });

  it("tells a pending person nothing about who runs an app", () => {
    const { state, ids } = organization();
    const s = act(state, settings({ visibility: "public", managers: [ids.max] }));
    expect(alumni(s, "pat")).toEqual({
      id: "alumni",
      canOpen: false,
      canManage: false,
      visibility: "public",
      managers: [],
    });
  });

  it("never puts an email address or account ID in what it says about apps", () => {
    const { state, ids } = organization();
    const s = act(
      state,
      settings({
        managers: [ids.max, ids.ivy],
        people: [
          { memberId: ids.ana, powers: [] },
          { memberId: ids.ivy, powers: ["admin"] },
        ],
      }),
    );
    for (const name of ["owner", "ana", "max", "pat"]) {
      const told = JSON.stringify(memberView(s, `${name}-sub`).apps);
      expect(told).not.toContain("@");
      expect(told).not.toContain("-sub");
    }
    // An invited manager has no name to show yet.
    expect(alumni(s, "ana").managers).toEqual(["max Example"]);
  });

  it("offers organization permissions only to the level and member editors", () => {
    const { state } = organization();
    expect(memberView(state, "owner-sub").catalog.map((p) => p.id)).toEqual([
      "members.read",
      "members.manage",
      "levels.manage",
      "audit.read",
    ]);
  });
});
