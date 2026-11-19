import { describe, expect, it } from "vitest";
import { applyCommand, effectivePermissions, emptyState, enroll } from "./domain";
import type { State } from "./contracts";

// Saving an app's settings, against the real catalog: the alumni directory has "records.read"
// (comes with access) and the extra powers "admin" and "refresh.run".
const meta = { id: "event-1", now: "2026-11-18T12:00:00Z" };
const identity = (name: string) => ({
  subject: `${name}-sub`,
  email: `${name}@example.test`,
  emailManaged: true,
});
const next = () => ({ ...meta, id: crypto.randomUUID() });

/** An owner plus active members Ana, Max and Sam on the basic level. */
function organization() {
  let state = enroll(emptyState("owner@example.test"), identity("owner"), meta).state;
  const ids: Record<string, string> = {};
  for (const name of ["ana", "max", "sam"]) {
    state = enroll(state, identity(name), next()).state;
    ids[name] = state.members.find((m) => m.subject === `${name}-sub`)!.id;
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
  return { state, ids };
}
function act(state: State, command: unknown, actor = "owner") {
  return applyCommand(state, `${actor}-sub`, command, next()).state;
}
const update = (overrides: Record<string, unknown> = {}) => ({
  type: "app.update",
  id: "alumni",
  visibility: "private",
  managers: [],
  people: [],
  ...overrides,
});
function status(run: () => unknown): number | undefined {
  try {
    run();
  } catch (error) {
    return (error as { status?: number }).status;
  }
  return undefined;
}
const permissionsOf = (state: State, id: string) =>
  effectivePermissions(
    state,
    state.members.find((m) => m.id === id)!,
  );

describe("saving an app's settings", () => {
  it("stores what the owner saves, tidied, with one history entry", () => {
    const { state, ids } = organization();
    const result = applyCommand(
      state,
      "owner-sub",
      update({
        managers: [ids.max, ids.max],
        people: [
          { memberId: ids.sam, powers: ["refresh.run", "admin", "admin"] },
          { memberId: ids.ana, powers: [] },
        ],
      }),
      next(),
    );
    const saved = {
      id: "alumni",
      visibility: "private",
      managers: [ids.max],
      people: [
        { memberId: ids.ana, powers: [] },
        { memberId: ids.sam, powers: ["admin", "refresh.run"] },
      ].sort((a, b) => a.memberId.localeCompare(b.memberId)),
    };
    expect(result.state.apps).toEqual([saved]);
    expect(result.state.revision).toBe(state.revision + 1);
    expect(result.audit).toMatchObject({
      action: "app.update",
      targetId: "alumni",
      before: null,
      after: saved,
    });
    expect(permissionsOf(result.state, ids.ana)).toEqual([
      "app.alumni.open",
      "app.alumni.records.read",
      "members.read",
    ]);
    expect(permissionsOf(result.state, ids.sam)).toContain("app.alumni.admin");
  });

  it("records the earlier settings when an app is changed again", () => {
    const { state, ids } = organization();
    const first = act(state, update({ people: [{ memberId: ids.ana, powers: [] }] }));
    const second = applyCommand(first, "owner-sub", update({ visibility: "public" }), next());
    expect(second.audit.before).toEqual(first.apps[0]);
    expect(second.state.apps).toHaveLength(1);
    expect(permissionsOf(second.state, ids.sam)).toContain("app.alumni.open");
  });

  it("lets a manager run their app: add a co-manager, then step down", () => {
    const { state, ids } = organization();
    let s = act(state, update({ managers: [ids.max] }));
    s = act(s, update({ managers: [ids.max, ids.ana], visibility: "public" }), "max");
    expect(s.apps[0]).toMatchObject({ visibility: "public", managers: [ids.ana, ids.max].sort() });
    s = act(s, update({ managers: [ids.ana], visibility: "public" }), "max");
    expect(s.apps[0].managers).toEqual([ids.ana]);
    expect(status(() => act(s, update(), "max"))).toBe(403);
  });

  it("refuses anyone who does not run the app", () => {
    const { state, ids } = organization();
    let s = act(state, update({ people: [{ memberId: ids.ana, powers: ["admin"] }] }));
    // On the app with a power, but not a manager.
    expect(status(() => act(s, update({ visibility: "public" }), "ana"))).toBe(403);
    // Not on the app at all.
    expect(status(() => act(s, update({ visibility: "public" }), "sam"))).toBe(403);
    // A membership administrator has no say over an app.
    s = act(s, {
      type: "level.save",
      name: "Admin",
      permissions: ["members.read", "members.manage", "levels.manage", "audit.read"],
    });
    const admin = s.levels.find((level) => level.name === "Admin")!.id;
    s = act(s, {
      type: "member.update",
      id: ids.sam,
      status: "active",
      levelId: admin,
      allow: [],
      deny: [],
      owner: false,
    });
    expect(status(() => act(s, update({ visibility: "public" }), "sam"))).toBe(403);
  });

  it("refuses a suspended manager", () => {
    const { state, ids } = organization();
    let s = act(state, update({ managers: [ids.max] }));
    s = act(s, {
      type: "member.update",
      id: ids.max,
      status: "suspended",
      levelId: "member",
      allow: [],
      deny: [],
      owner: false,
    });
    expect(s.apps[0].managers).toEqual([ids.max]);
    expect(permissionsOf(s, ids.max)).toEqual([]);
    expect(status(() => act(s, update({ visibility: "public" }), "max"))).toBe(403);
  });

  it.each([
    ["an unknown app", { id: "nowhere" }],
    ["an unknown manager", { managers: ["nobody"] }],
    ["an unknown person", { people: [{ memberId: "nobody", powers: [] }] }],
    ["a power the app does not declare", { people: [{ memberId: "ANA", powers: ["retired"] }] }],
    ["a power that comes with access", { people: [{ memberId: "ANA", powers: ["records.read"] }] }],
    ["the open permission as a power", { people: [{ memberId: "ANA", powers: ["open"] }] }],
    ["a visibility that does not exist", { visibility: "everyone" }],
    ["an extra field", { owner: true }],
  ])("refuses %s", (_name, overrides) => {
    const { state, ids } = organization();
    const command = JSON.parse(JSON.stringify(update(overrides)).replaceAll("ANA", ids.ana));
    expect(status(() => act(state, command))).toBe(400);
  });
});

describe("app access and the rest of membership", () => {
  it("no longer accepts app permissions on a level or a member", () => {
    const { state, ids } = organization();
    expect(
      status(() =>
        act(state, { type: "level.save", name: "Alumni", permissions: ["app.alumni.open"] }),
      ),
    ).toBe(400);
    const edit = (field: "allow" | "deny") => ({
      type: "member.update",
      id: ids.ana,
      status: "active",
      levelId: "member",
      allow: [],
      deny: [],
      owner: false,
      [field]: ["app.alumni.admin"],
    });
    expect(status(() => act(state, edit("allow")))).toBe(400);
    expect(status(() => act(state, edit("deny")))).toBe(400);
  });

  it("takes a removed member off every app", () => {
    const { state, ids } = organization();
    let s = act(
      state,
      update({ managers: [ids.max, ids.ana], people: [{ memberId: ids.max, powers: ["admin"] }] }),
    );
    s = act(s, { type: "member.remove", id: ids.max });
    expect(s.apps[0]).toMatchObject({ managers: [ids.ana], people: [] });
  });

  it("lets a membership administrator suspend someone who runs an app they are not in", () => {
    const { state, ids } = organization();
    let s = act(state, update({ managers: [ids.max] }));
    s = act(s, {
      type: "level.save",
      name: "Admin",
      permissions: ["members.read", "members.manage"],
    });
    const admin = s.levels.find((level) => level.name === "Admin")!.id;
    s = act(s, {
      type: "member.update",
      id: ids.sam,
      status: "active",
      levelId: admin,
      allow: [],
      deny: [],
      owner: false,
    });
    const suspend = {
      type: "member.update",
      id: ids.max,
      status: "suspended",
      levelId: "member",
      allow: [],
      deny: [],
      owner: false,
    };
    expect(act(s, suspend, "sam").members.find((m) => m.id === ids.max)!.status).toBe("suspended");
    expect(act(s, { type: "member.remove", id: ids.max }, "sam").apps[0].managers).toEqual([]);
  });
});
