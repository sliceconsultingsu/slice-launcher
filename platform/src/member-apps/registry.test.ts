import { describe, expect, it } from "vitest";
import {
  applyCommand,
  effectivePermissions,
  emptyState,
  enroll,
  memberView,
} from "../membership/domain";
import type { State } from "../membership/contracts";
import { catalogFor, shownVersion, toolsApproved } from "./registry";

// An owner plus active members Ana, Max and Sam; Pia is still pending.
const meta = () => ({ id: crypto.randomUUID(), now: "2026-11-19T12:00:00Z" });
const identity = (name: string) => ({
  subject: `${name}-sub`,
  email: `${name}@example.test`,
  emailManaged: true,
});
function organization() {
  let state = enroll(emptyState("owner@example.test"), identity("owner"), meta()).state;
  const ids: Record<string, string> = {};
  for (const name of ["ana", "max", "sam", "pia"]) {
    state = enroll(state, identity(name), meta()).state;
    ids[name] = state.members.find((m) => m.subject === `${name}-sub`)!.id;
    if (name !== "pia")
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
  ids.owner = state.members.find((m) => m.owner)!.id;
  return { state, ids };
}
function act(state: State, command: unknown, actor = "owner") {
  return applyCommand(state, `${actor}-sub`, command, meta()).state;
}
function status(run: () => unknown): number | undefined {
  try {
    run();
  } catch (error) {
    return (error as { status?: number }).status;
  }
  return undefined;
}
const create = (id = "notes", extra: Record<string, unknown> = {}) => ({
  type: "memberapp.create",
  id,
  name: "Team notes",
  description: "Notes the team shares.",
  ...extra,
});
const publish = (id = "notes", extra: Record<string, unknown> = {}) => ({
  type: "memberapp.publish",
  id,
  name: "Team notes",
  description: "Notes the team shares.",
  powers: [],
  ...extra,
});
const settings = (id = "notes", extra: Record<string, unknown> = {}) => ({
  type: "app.update",
  id,
  visibility: "private",
  managers: [],
  people: [],
  ...extra,
});
const permissionsOf = (state: State, memberId: string) =>
  effectivePermissions(
    state,
    state.members.find((m) => m.id === memberId)!,
  );
const app = (state: State, id = "notes") => state.memberApps.find((item) => item.id === id)!;

describe("creating an app", () => {
  it("records the app and makes the person who created it its manager", () => {
    const { state, ids } = organization();
    const result = applyCommand(state, "ana-sub", create(), meta());
    expect(app(result.state)).toEqual({
      id: "notes",
      name: "Team notes",
      description: "Notes the team shares.",
      powers: [],
      createdBy: ids.ana,
      createdAt: "2026-11-19T12:00:00Z",
      live: null,
      latest: 0,
      publicApproved: false,
      publicRequestedBy: null,
      deletedAt: null,
      database: null,
      preview: null,
    });
    expect(result.state.apps.find((item) => item.id === "notes")).toEqual({
      id: "notes",
      visibility: "private",
      managers: [ids.ana],
      people: [],
    });
    expect(result.audit).toMatchObject({ action: "memberapp.create", targetId: "notes" });
    expect(result.state.revision).toBe(state.revision + 1);
    expect(permissionsOf(result.state, ids.ana)).toContain("app.notes.open");
    expect(permissionsOf(result.state, ids.max)).not.toContain("app.notes.open");
    expect(catalogFor(result.state).map((item) => item.id)).toContain("notes");
  });

  it.each([
    ["a name that breaks the rules", "My Notes", 400],
    ["a reserved name", "admin", 400],
    ["the name of a built-in app", "alumni", 409],
  ])("refuses %s", (_why, id, expected) => {
    const { state } = organization();
    expect(status(() => act(state, create(id), "ana"))).toBe(expected);
  });

  it("refuses a name in use, and one a deleted app used", () => {
    const { state } = organization();
    let s = act(state, create(), "ana");
    expect(status(() => act(s, create(), "max"))).toBe(409);
    s = act(s, { type: "memberapp.delete", id: "notes" }, "ana");
    expect(status(() => act(s, create(), "max"))).toBe(409);
  });

  it("refuses someone who is not an active member", () => {
    const { state, ids } = organization();
    expect(status(() => act(state, create(), "pia"))).toBe(403);
    const suspended = act(state, {
      type: "member.update",
      id: ids.sam,
      status: "suspended",
      levelId: "member",
      allow: [],
      deny: [],
      owner: false,
    });
    expect(status(() => act(suspended, create(), "sam"))).toBe(403);
  });

  it("stops a member at five apps, not counting deleted ones; owners have no limit", () => {
    const { state } = organization();
    let s = state;
    for (const n of [1, 2, 3, 4, 5]) s = act(s, create(`ana-app-${n}`), "ana");
    expect(status(() => act(s, create("ana-app-6"), "ana"))).toBe(403);
    expect(status(() => act(s, create("max-app-1"), "max"))).toBeUndefined();
    s = act(s, { type: "memberapp.delete", id: "ana-app-1" }, "ana");
    expect(status(() => act(s, create("ana-app-6"), "ana"))).toBeUndefined();
    let owned = state;
    for (const n of [1, 2, 3, 4, 5, 6]) owned = act(owned, create(`owner-app-${n}`));
    expect(owned.memberApps).toHaveLength(6);
  });
});

describe("publishing", () => {
  it("makes each publish the next version and puts it live", () => {
    const { state } = organization();
    let s = act(state, create(), "ana");
    const first = applyCommand(
      s,
      "ana-sub",
      publish("notes", { name: "Notes", powers: [{ id: "edit", label: "Edit notes" }] }),
      meta(),
    );
    expect(app(first.state)).toMatchObject({
      name: "Notes",
      latest: 1,
      live: 1,
      powers: [{ id: "edit", label: "Edit notes" }],
    });
    expect(first.audit).toMatchObject({ action: "memberapp.publish", targetId: "notes" });
    s = act(first.state, publish(), "ana");
    expect(app(s)).toMatchObject({ name: "Team notes", latest: 2, live: 2, powers: [] });
  });

  it("remembers the app's database from the first publish that has server code", () => {
    const { state } = organization();
    let s = act(state, create(), "ana");
    s = act(s, publish(), "ana");
    expect(app(s).database).toBeNull();
    s = act(s, publish("notes", { database: "db-1" }), "ana");
    expect(app(s).database).toBe("db-1");
    // A later version without server code does not forget it: the data is still the app's.
    s = act(s, publish(), "ana");
    expect(app(s).database).toBe("db-1");
  });

  it("lets only the people who run the app publish it", () => {
    const { state, ids } = organization();
    let s = act(state, create(), "ana");
    s = act(
      s,
      settings("notes", { managers: [ids.ana], people: [{ memberId: ids.max, powers: [] }] }),
      "ana",
    );
    expect(status(() => act(s, publish(), "max"))).toBe(403);
    expect(status(() => act(s, publish(), "sam"))).toBe(403);
    expect(status(() => act(s, publish()))).toBeUndefined();
  });

  it("refuses an app that does not exist or was deleted", () => {
    const { state } = organization();
    expect(status(() => act(state, publish("nowhere"), "ana"))).toBe(404);
    expect(status(() => act(state, publish("alumni")))).toBe(404);
    let s = act(state, create(), "ana");
    s = act(s, { type: "memberapp.delete", id: "notes" }, "ana");
    expect(status(() => act(s, publish(), "ana"))).toBe(404);
  });

  it.each([
    [
      "a power listed twice",
      [
        { id: "edit", label: "Edit" },
        { id: "edit", label: "Again" },
      ],
    ],
    ["a power called open", [{ id: "open", label: "Open" }]],
    ["a power with a bad ID", [{ id: "Edit Notes", label: "Edit" }]],
    ["a power with no label", [{ id: "edit", label: " " }]],
    ["more than 20 powers", Array.from({ length: 21 }, (_, n) => ({ id: `p${n}`, label: "P" }))],
  ])("refuses %s", (_why, powers) => {
    const { state } = organization();
    const s = act(state, create(), "ana");
    expect(status(() => act(s, publish("notes", { powers }), "ana"))).toBe(400);
  });

  it("stops granting a power the new version no longer has", () => {
    const { state, ids } = organization();
    let s = act(state, create(), "ana");
    s = act(s, publish("notes", { powers: [{ id: "edit", label: "Edit notes" }] }), "ana");
    s = act(
      s,
      settings("notes", { managers: [ids.ana], people: [{ memberId: ids.max, powers: ["edit"] }] }),
      "ana",
    );
    expect(permissionsOf(s, ids.max)).toContain("app.notes.edit");
    s = act(s, publish(), "ana");
    expect(permissionsOf(s, ids.max)).toContain("app.notes.open");
    expect(permissionsOf(s, ids.max)).not.toContain("app.notes.edit");
  });
});

describe("publishing a preview", () => {
  const preview = (extra: Record<string, unknown> = {}) =>
    publish("notes", { preview: true, ...extra });

  it("stores the version without changing what is live", () => {
    const { state } = organization();
    let s = act(state, create(), "ana");
    s = act(s, publish(), "ana");
    const result = applyCommand(s, "ana-sub", preview({ name: "Notes, next" }), meta());
    expect(app(result.state)).toMatchObject({ latest: 2, live: 1, preview: 2 });
    expect(result.audit).toMatchObject({ action: "memberapp.publish", targetId: "notes" });
    // What everyone sees is described by the live version until the preview is made live.
    expect(app(result.state).name).toBe("Team notes");
  });

  it("can be the first thing published: a draft nobody else can open", () => {
    const { state } = organization();
    let s = act(state, create(), "ana");
    s = act(s, preview(), "ana");
    expect(app(s)).toMatchObject({ latest: 1, live: null, preview: 1 });
  });

  it("is replaced by the next preview and cleared by a live publish", () => {
    const { state } = organization();
    let s = act(state, create(), "ana");
    s = act(s, preview(), "ana");
    s = act(s, preview(), "ana");
    expect(app(s)).toMatchObject({ latest: 2, live: null, preview: 2 });
    s = act(s, publish(), "ana");
    expect(app(s)).toMatchObject({ latest: 3, live: 3, preview: null });
  });

  it("becomes what everyone sees when it is made live", () => {
    const { state } = organization();
    let s = act(state, create(), "ana");
    s = act(s, publish(), "ana");
    s = act(s, preview({ name: "Notes, next", powers: [{ id: "edit", label: "Edit" }] }), "ana");
    s = act(s, { type: "memberapp.live", id: "notes", version: 2 }, "ana");
    expect(app(s)).toMatchObject({ live: 2, preview: null });
  });

  it("can be discarded, or pointed at an earlier version, by the people who run the app", () => {
    const { state } = organization();
    let s = act(state, create(), "ana");
    s = act(s, publish(), "ana");
    s = act(s, preview(), "ana");
    const discarded = applyCommand(
      s,
      "ana-sub",
      { type: "memberapp.preview", id: "notes", version: null },
      meta(),
    );
    expect(app(discarded.state)).toMatchObject({ live: 1, preview: null, latest: 2 });
    expect(discarded.audit).toMatchObject({ action: "memberapp.preview", targetId: "notes" });
    expect(app(act(s, { type: "memberapp.preview", id: "notes", version: 1 }, "ana")).preview).toBe(
      1,
    );
    expect(
      status(() => act(s, { type: "memberapp.preview", id: "notes", version: 3 }, "ana")),
    ).toBe(400);
    expect(
      status(() => act(s, { type: "memberapp.preview", id: "notes", version: null }, "max")),
    ).toBe(403);
  });

  it("is kept when the app is taken offline and gone when it is deleted", () => {
    const { state } = organization();
    let s = act(state, create(), "ana");
    s = act(s, publish(), "ana");
    s = act(s, preview(), "ana");
    expect(
      app(act(s, { type: "memberapp.live", id: "notes", version: null }, "ana")),
    ).toMatchObject({
      live: null,
      preview: 2,
    });
    expect(app(act(s, { type: "memberapp.delete", id: "notes" }, "ana")).preview).toBeNull();
  });

  it("is what the people who run the app are shown, and nobody else", () => {
    const { state } = organization();
    let s = act(state, create(), "ana");
    s = act(s, publish(), "ana");
    s = act(s, preview(), "ana");
    expect(shownVersion(app(s), true)).toBe(2);
    expect(shownVersion(app(s), false)).toBe(1);
    const draft = act(act(state, create("draft"), "ana"), preview({ id: "draft" }), "ana");
    expect(shownVersion(app(draft, "draft"), true)).toBe(1);
    expect(shownVersion(app(draft, "draft"), false)).toBeNull();
  });
});

describe("taking an app offline, putting a version live, and deleting", () => {
  it("lets a manager unpublish and choose a published version", () => {
    const { state } = organization();
    let s = act(state, create(), "ana");
    s = act(s, publish(), "ana");
    s = act(s, publish(), "ana");
    const off = applyCommand(
      s,
      "ana-sub",
      { type: "memberapp.live", id: "notes", version: null },
      meta(),
    );
    expect(app(off.state)).toMatchObject({ live: null, latest: 2 });
    expect(off.audit).toMatchObject({ action: "memberapp.live", targetId: "notes" });
    s = act(off.state, { type: "memberapp.live", id: "notes", version: 1 }, "ana");
    expect(app(s).live).toBe(1);
  });

  it.each([0, 3, -1, 1.5])("refuses version %s, which was never published", (version) => {
    const { state } = organization();
    let s = act(state, create(), "ana");
    s = act(s, publish(), "ana");
    s = act(s, publish(), "ana");
    expect(status(() => act(s, { type: "memberapp.live", id: "notes", version }, "ana"))).toBe(400);
  });

  it("lets an owner stop any app, and nobody else who does not run it", () => {
    const { state } = organization();
    let s = act(state, create(), "ana");
    s = act(s, publish(), "ana");
    expect(
      status(() => act(s, { type: "memberapp.live", id: "notes", version: null }, "max")),
    ).toBe(403);
    expect(app(act(s, { type: "memberapp.live", id: "notes", version: null })).live).toBeNull();
    expect(status(() => act(s, { type: "memberapp.delete", id: "notes" }, "max"))).toBe(403);
  });

  it("deleting takes the app offline, clears who was on it and keeps its name reserved", () => {
    const { state, ids } = organization();
    let s = act(state, create(), "ana");
    s = act(s, publish(), "ana");
    s = act(
      s,
      settings("notes", { managers: [ids.ana], people: [{ memberId: ids.max, powers: [] }] }),
      "ana",
    );
    const result = applyCommand(s, "ana-sub", { type: "memberapp.delete", id: "notes" }, meta());
    expect(app(result.state)).toMatchObject({ live: null, deletedAt: "2026-11-19T12:00:00Z" });
    expect(result.state.apps.some((item) => item.id === "notes")).toBe(false);
    expect(result.audit).toMatchObject({ action: "memberapp.delete", targetId: "notes" });
    expect(permissionsOf(result.state, ids.ana)).not.toContain("app.notes.open");
    expect(permissionsOf(result.state, ids.owner)).not.toContain("app.notes.open");
    expect(catalogFor(result.state).map((item) => item.id)).not.toContain("notes");
    expect(status(() => act(result.state, settings("notes")))).toBe(400);
    expect(status(() => act(result.state, { type: "memberapp.delete", id: "notes" }, "ana"))).toBe(
      404,
    );
  });
});

describe("sharing a member app", () => {
  it("lets its manager add people at once", () => {
    const { state, ids } = organization();
    let s = act(state, create(), "ana");
    s = act(
      s,
      settings("notes", { managers: [ids.ana], people: [{ memberId: ids.max, powers: [] }] }),
      "ana",
    );
    expect(permissionsOf(s, ids.max)).toContain("app.notes.open");
    expect(permissionsOf(s, ids.sam)).not.toContain("app.notes.open");
  });

  it("keeps it private and records the request when a manager asks for Public", () => {
    const { state, ids } = organization();
    let s = act(state, create(), "ana");
    const asked = applyCommand(
      s,
      "ana-sub",
      settings("notes", {
        visibility: "public",
        managers: [ids.ana],
        people: [{ memberId: ids.max, powers: [] }],
      }),
      meta(),
    );
    s = asked.state;
    expect(s.apps.find((item) => item.id === "notes")).toMatchObject({
      visibility: "private",
      people: [{ memberId: ids.max, powers: [] }],
    });
    expect(app(s)).toMatchObject({ publicApproved: false, publicRequestedBy: ids.ana });
    expect(asked.audit.after).toMatchObject({ visibility: "private", publicRequested: true });
    expect(permissionsOf(s, ids.sam)).not.toContain("app.notes.open");
  });

  it("goes Public when an owner saves it as Public, and stays approved", () => {
    const { state, ids } = organization();
    let s = act(state, create(), "ana");
    s = act(s, settings("notes", { visibility: "public", managers: [ids.ana] }), "ana");
    const approved = applyCommand(
      s,
      "owner-sub",
      settings("notes", { visibility: "public", managers: [ids.ana] }),
      meta(),
    );
    s = approved.state;
    expect(app(s)).toMatchObject({ publicApproved: true, publicRequestedBy: null });
    expect(approved.audit.after).toMatchObject({ visibility: "public", publicApproved: true });
    expect(permissionsOf(s, ids.sam)).toContain("app.notes.open");
    // Its manager can now switch it either way without asking again.
    s = act(s, settings("notes", { managers: [ids.ana] }), "ana");
    expect(permissionsOf(s, ids.sam)).not.toContain("app.notes.open");
    s = act(s, settings("notes", { visibility: "public", managers: [ids.ana] }), "ana");
    expect(permissionsOf(s, ids.sam)).toContain("app.notes.open");
    expect(app(s).publicRequestedBy).toBeNull();
  });

  it("drops the request when an owner saves it as Private, or the asker saves Private", () => {
    const { state, ids } = organization();
    let s = act(state, create(), "ana");
    const asked = act(s, settings("notes", { visibility: "public", managers: [ids.ana] }), "ana");
    s = act(asked, settings("notes", { managers: [ids.ana] }));
    expect(app(s)).toMatchObject({ publicApproved: false, publicRequestedBy: null });
    s = act(asked, settings("notes", { managers: [ids.ana] }), "ana");
    expect(app(s).publicRequestedBy).toBeNull();
  });

  it("does not ask for approval on a built-in app", () => {
    const { state, ids } = organization();
    const s = act(state, settings("alumni", { visibility: "public" }));
    expect(permissionsOf(s, ids.sam)).toContain("app.alumni.open");
  });

  it("forgets a request from someone who is removed, and keeps their app", () => {
    const { state, ids } = organization();
    let s = act(state, create(), "ana");
    s = act(s, settings("notes", { visibility: "public", managers: [ids.ana, ids.max] }), "ana");
    s = act(s, { type: "member.remove", id: ids.ana });
    expect(app(s)).toMatchObject({ createdBy: ids.ana, publicRequestedBy: null, deletedAt: null });
    expect(s.apps.find((item) => item.id === "notes")!.managers).toEqual([ids.max]);
  });
});

describe("an owner's OK for an app's tools", () => {
  const one = { digest: "1".repeat(32), count: 2 };
  const two = { digest: "2".repeat(32), count: 2 };
  const approve = (digest: string | null) => ({
    type: "memberapp.tools",
    id: "notes",
    approve: digest,
  });
  const app = (state: State) => state.memberApps.find((item) => item.id === "notes")!;
  const published = () => {
    const { state, ids } = organization();
    return {
      ids,
      state: act(act(state, create(), "ana"), publish("notes", { tools: one }), "ana"),
    };
  };

  it("records what the live version offers, and that nobody has agreed to it yet", () => {
    const { state } = published();
    expect(app(state).tools).toEqual(one);
    expect(toolsApproved(app(state))).toBe(false);
    // A version with no tools offers none.
    expect(app(act(state, publish(), "ana")).tools).toBeNull();
  });

  it("lets an owner agree, and nobody else: not even the person who runs the app", () => {
    const { state, ids } = published();
    expect(status(() => act(state, approve(one.digest), "ana"))).toBe(403);
    expect(status(() => act(state, approve(one.digest), "max"))).toBe(403);
    const agreed = act(state, approve(one.digest));
    expect(app(agreed).toolsApproved).toEqual({
      digest: one.digest,
      by: ids.owner,
      at: "2026-11-19T12:00:00Z",
    });
    expect(toolsApproved(app(agreed))).toBe(true);
  });

  it("refuses an OK for tools other than the ones that are live", () => {
    const { state } = published();
    expect(status(() => act(state, approve(two.digest)))).toBe(409);
    // Nothing is live: nothing to agree to.
    const offline = act(state, { type: "memberapp.live", id: "notes", version: null }, "ana");
    expect(status(() => act(offline, approve(one.digest)))).toBe(409);
    // No tools at all.
    expect(status(() => act(act(state, publish(), "ana"), approve(one.digest)))).toBe(409);
    expect(status(() => act(state, approve("not-a-fingerprint")))).toBe(400);
  });

  it("needs the OK again once the tools change, and keeps it when they do not", () => {
    const agreed = act(published().state, approve(one.digest));
    const same = act(agreed, publish("notes", { tools: one }), "ana");
    expect(toolsApproved(app(same))).toBe(true);
    const changed = act(agreed, publish("notes", { tools: two }), "ana");
    expect(toolsApproved(app(changed))).toBe(false);
    // Going back to the version that was agreed to brings the OK back with it.
    const back = act(
      changed,
      {
        type: "memberapp.live",
        id: "notes",
        version: 1,
        as: { name: "Team notes", description: "Notes the team shares.", powers: [], tools: one },
      },
      "ana",
    );
    expect(toolsApproved(app(back))).toBe(true);
  });

  it("leaves what is live, and its OK, alone when a preview is published", () => {
    const agreed = act(published().state, approve(one.digest));
    const previewing = act(agreed, publish("notes", { tools: two, preview: true }), "ana");
    expect(app(previewing).tools).toEqual(one);
    expect(toolsApproved(app(previewing))).toBe(true);
  });

  it("lets an owner take the OK back", () => {
    const agreed = act(published().state, approve(one.digest));
    expect(status(() => act(agreed, approve(null), "ana"))).toBe(403);
    const withdrawn = act(agreed, approve(null));
    expect(app(withdrawn).toolsApproved).toBeNull();
    expect(toolsApproved(app(withdrawn))).toBe(false);
  });

  it("tells the people who run the app how many tools it offers and whether they are agreed", () => {
    const { state, ids } = published();
    const told = (from: State) =>
      memberView(from, "ana-sub").apps.find((item) => item.id === "notes")!.member!.manage!.tools;
    expect(told(state)).toEqual({ ...one, approved: false });
    expect(told(act(state, approve(one.digest)))).toEqual({ ...one, approved: true });
    expect(
      told(act(state, { type: "memberapp.live", id: "notes", version: null }, "ana")),
    ).toBeNull();
    // Someone merely on the app is not told.
    const shared = act(
      state,
      settings("notes", { managers: [ids.ana], people: [{ memberId: ids.max, powers: [] }] }),
      "ana",
    );
    expect(
      memberView(shared, "max-sub").apps.find((item) => item.id === "notes")!.member!.manage,
    ).toBeUndefined();
  });
});

describe("what each person is told about member apps", () => {
  /** Ana runs "notes" (published, with a power); Max is on it; Sam is not. */
  function shared() {
    const { state, ids } = organization();
    let s = act(state, { type: "profile.update", name: "Ana", title: "" }, "ana");
    s = act(s, create(), "ana");
    s = act(s, publish("notes", { powers: [{ id: "edit", label: "Edit notes" }] }), "ana");
    s = act(
      s,
      settings("notes", { managers: [ids.ana], people: [{ memberId: ids.max, powers: [] }] }),
      "ana",
    );
    return { state: s, ids };
  }
  const told = (state: State, name: string, id = "notes") =>
    memberView(state, `${name}-sub`, { appHost: "slice.example" }).apps.find(
      (item) => item.id === id,
    );

  it("tells the people who run an app everything needed to manage it", () => {
    const { state, ids } = shared();
    expect(told(state, "ana")).toMatchObject({
      id: "notes",
      canOpen: true,
      canManage: true,
      visibility: "private",
      managers: ["Ana"],
      settings: { id: "notes", managers: [ids.ana] },
      member: {
        name: "Team notes",
        description: "Notes the team shares.",
        live: true,
        manage: {
          powers: [{ id: "edit", label: "Edit notes" }],
          liveVersion: 1,
          preview: null,
          latest: 1,
          publicApproved: false,
          publicRequestedBy: null,
        },
      },
    });
  });

  it("tells someone on the app only what they need to open it", () => {
    const { state } = shared();
    const view = told(state, "max")!;
    expect(view).toMatchObject({
      canOpen: true,
      canManage: false,
      member: { name: "Team notes", description: "Notes the team shares.", live: true },
    });
    expect(view.member).not.toHaveProperty("manage");
    expect(view).not.toHaveProperty("settings");
  });

  it("does not mention the app to someone who is not on it", () => {
    const { state } = shared();
    expect(told(state, "sam")).toBeUndefined();
    expect(told(state, "pia")).toBeUndefined();
    expect(memberView(state, "sam-sub").permissions).not.toContain("app.notes.open");
  });

  it("shows an owner every member app, and who is waiting for their OK", () => {
    const { state, ids } = shared();
    const asked = act(
      state,
      settings("notes", {
        visibility: "public",
        managers: [ids.ana],
        people: [{ memberId: ids.max, powers: [] }],
      }),
      "ana",
    );
    expect(told(asked, "owner")).toMatchObject({
      canManage: true,
      member: { manage: { publicApproved: false, publicRequestedBy: "Ana" } },
    });
    expect(told(asked, "ana")!.member!.manage!.publicRequestedBy).toBe("Ana");
  });

  it("keeps an offline app in view, marked as not live, and drops a deleted one", () => {
    const { state } = shared();
    const offline = act(state, { type: "memberapp.live", id: "notes", version: null }, "ana");
    expect(told(offline, "ana")!.member).toMatchObject({
      live: false,
      manage: { liveVersion: null },
    });
    expect(told(offline, "max")!.member).toMatchObject({ live: false });
    const deleted = act(state, { type: "memberapp.delete", id: "notes" }, "ana");
    expect(told(deleted, "ana")).toBeUndefined();
    expect(told(deleted, "owner")).toBeUndefined();
  });

  it("says where member apps live, or that they are off", () => {
    const { state } = shared();
    expect(memberView(state, "ana-sub", { appHost: "slice.example" }).appHost).toBe(
      "slice.example",
    );
    expect(memberView(state, "ana-sub").appHost).toBeNull();
    // Built-in apps are listed as before, for everyone.
    expect(memberView(state, "sam-sub").apps.map((item) => item.id)).toEqual(["alumni"]);
  });
});
