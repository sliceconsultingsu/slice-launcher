import { apps } from "../lib/apps";
import { catalogFor } from "../member-apps/registry";
import { APP_LIMIT, appIdProblem } from "../member-apps/rules";
import type { AppDescriptor } from "../platform/contracts";
import { appPermissions, managesApp, settingsFor } from "./app-access";
import { commandSchema, emailSchema, MembershipError, organizationPermissions } from "./contracts";
import type {
  AppSettings,
  AppView,
  Audit,
  Identity,
  Member,
  MemberApp,
  MemberRecord,
  Meta,
  Mutation,
  SignedInIdentity,
  State,
  View,
} from "./contracts";
export { MembershipError } from "./contracts";

function fail(status: number, message: string): never {
  throw new MembershipError(status, message);
}
export function emptyState(ownerEmail: string | null): State {
  return {
    revision: 0,
    ownerEmail,
    ownerClaimed: false,
    members: [],
    levels: [{ id: "member", name: "Member", permissions: ["members.read"] }],
    apps: [],
    memberApps: [],
  };
}
/**
 * Everything this member may do. Organization permissions come from their level and individual
 * grants; app permissions come only from each app's own settings. Pages, app APIs and AI tools
 * all ask here, so this is the one place the rules live.
 */
export function effectivePermissions(
  state: State,
  member: Member,
  catalog: readonly AppDescriptor[] = catalogFor(state),
): string[] {
  if (member.status !== "active") return [];
  const organization = organizationPermissions.map((p) => p.id);
  const base = state.levels.find((level) => level.id === member.levelId)?.permissions ?? [];
  const held = member.owner
    ? organization
    : [...new Set([...base, ...member.allow])].filter(
        (p) => organization.includes(p) && !member.deny.includes(p),
      );
  return [...held, ...catalog.flatMap((app) => appPermissions(state, member, app))].sort();
}
function subjectMember(state: State, subject: string): Member {
  return state.members.find((m) => m.subject === subject) ?? fail(403, "Membership not found.");
}
function finish(
  state: State,
  meta: Meta,
  actorId: string,
  action: string,
  targetId: string,
  before: unknown,
  after: unknown,
): Mutation {
  state.revision += 1;
  return { state, audit: { id: meta.id, at: meta.now, actorId, action, targetId, before, after } };
}
export function enroll(
  original: State,
  identity: SignedInIdentity,
  meta: Meta,
): Mutation | { state: State; audit: null } {
  const state = structuredClone(original);
  const parsed = emailSchema.safeParse(identity.email);
  if (!parsed.success || !identity.subject) fail(401, "Verified identity is required.");
  const email = parsed.data;
  const bound = state.members.find((m) => m.subject === identity.subject);
  if (bound) {
    if (bound.email !== email) fail(403, "Your sign-in email changed. Contact an administrator.");
    return { state: original, audit: null };
  }
  // Checked here, where the claim happens, not only at sign-in: an invitation or owner email can
  // be set up after this person signed in.
  if (!identity.emailManaged && claimsByEmail(state, identity))
    fail(
      403,
      "This Google account can't claim the invitation for this email. Sign in with the invited Google account, or ask an administrator.",
    );
  const invited = state.members.find((m) => m.email === email);
  if (invited?.subject)
    fail(403, "This email is already linked to a different identity. Contact an administrator.");
  const before = invited ? structuredClone(invited) : null;
  const member: Member = invited ?? {
    id: meta.id,
    subject: null,
    email,
    name: "",
    title: "",
    status: "pending",
    levelId: null,
    allow: [],
    deny: [],
    owner: false,
    joinedAt: meta.now,
  };
  member.subject = identity.subject;
  if (member.status === "invited") member.status = "active";
  // Owner email is configured by an operator and consumed once, never derived from first visit.
  if (!state.ownerClaimed && state.ownerEmail && email === state.ownerEmail.toLowerCase()) {
    member.owner = true;
    member.status = "active";
    member.levelId = "member";
    state.ownerClaimed = true;
  }
  if (!invited) state.members.push(member);
  return finish(state, meta, member.id, "member.signin", member.id, before, member);
}
/**
 * Whether signing in as this identity would claim something by email alone: another member's
 * record (an invitation, or an existing member being moved off Cloudflare Access) or the
 * unclaimed owner seat. Callers allow that only when Google manages the address.
 */
export function claimsByEmail(state: State, identity: Identity): boolean {
  const email = identity.email.toLowerCase();
  if (!state.ownerClaimed && state.ownerEmail?.toLowerCase() === email) return true;
  return state.members.some(
    (m) => m.email.toLowerCase() === email && m.subject !== identity.subject,
  );
}
/**
 * Moves a member from their old Cloudflare Access identity to their Google identity on first
 * Google sign-in. Only a member whose subject still carries the legacy Access issuer is moved, and
 * only to a Google identity nobody else holds, so an account already on Google is never re-linked
 * by email. Returns null when there is nothing to migrate.
 */
export function migrateLegacyIdentity(
  original: State,
  identity: Identity,
  legacyIssuer: string,
  meta: Meta,
): Mutation | null {
  if (!legacyIssuer || original.members.some((m) => m.subject === identity.subject)) return null;
  const email = identity.email.toLowerCase();
  const prefix = `${legacyIssuer}|`;
  const index = original.members.findIndex(
    (m) => m.email.toLowerCase() === email && m.subject?.startsWith(prefix),
  );
  if (index < 0) return null;
  const state = structuredClone(original);
  const member = state.members[index];
  const before = { subject: member.subject };
  member.subject = identity.subject;
  return finish(state, meta, member.id, "member.identity_migrated", member.id, before, {
    subject: member.subject,
  });
}
export function applyCommand(
  original: State,
  subject: string,
  input: unknown,
  meta: Meta,
): Mutation {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) fail(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  const command = parsed.data;
  const state = structuredClone(original);
  const actor = subjectMember(state, subject);
  const access = effectivePermissions(state, actor);
  const requirePermission = (p: string) => {
    if (!access.includes(p)) fail(403, "You do not have permission for this action.");
  };
  // Compares organization permissions only. App access never outranks a membership administrator,
  // or they could not suspend someone merely because that person runs an app they are not in.
  const canDelegate = (permissions: string[]) => {
    if (
      !actor.owner &&
      permissions.some(
        (p) => organizationPermissions.some((item) => item.id === p) && !access.includes(p),
      )
    )
      fail(403, "You cannot assign permissions beyond your own access.");
  };
  const levelById = (id: string) =>
    state.levels.find((level) => level.id === id) ?? fail(400, "Access level does not exist.");
  if (command.type === "profile.update") {
    if (actor.status === "suspended") fail(403, "Your membership is suspended.");
    const before = structuredClone(actor);
    actor.name = command.name;
    actor.title = command.title;
    return finish(state, meta, actor.id, command.type, actor.id, before, actor);
  }
  if (command.type === "level.save") {
    requirePermission("levels.manage");
    canDelegate(command.permissions);
    const existing = command.id ? levelById(command.id) : undefined;
    if (
      state.levels.some(
        (l) => l.name.toLowerCase() === command.name.toLowerCase() && l.id !== command.id,
      )
    )
      fail(409, "An access level with this name already exists.");
    if (existing) {
      if (!actor.owner && actor.levelId === existing.id)
        fail(403, "You cannot edit your own access level.");
      canDelegate(existing.permissions);
      for (const member of state.members.filter((m) => m.levelId === existing.id)) {
        if (member.owner && !actor.owner)
          fail(403, "Only an owner can change an owner's access level.");
        canDelegate(effectivePermissions(state, { ...member, status: "active" }));
      }
    }
    const before = existing ? structuredClone(existing) : null;
    const level = {
      id: existing?.id ?? meta.id,
      name: command.name,
      permissions: command.permissions,
    };
    if (existing) state.levels = state.levels.map((l) => (l.id === level.id ? level : l));
    else state.levels.push(level);
    return finish(state, meta, actor.id, command.type, level.id, before, level);
  }
  if (command.type === "app.update") {
    const app =
      catalogFor(state).find((item) => item.id === command.id) ??
      fail(400, "Application does not exist.");
    if (!managesApp(state, actor, app.id))
      fail(403, "Only the people who run this app can change its settings.");
    const known = (memberId: string) =>
      state.members.some((m) => m.id === memberId) || fail(400, "Member does not exist.");
    command.managers.forEach(known);
    const extra = app.permissions.filter((p) => !p.withAccess).map((p) => p.id);
    for (const person of command.people) {
      known(person.memberId);
      if (person.powers.some((power) => !extra.includes(power)))
        fail(400, "This app has no such extra power.");
    }
    if (new Set(command.people.map((p) => p.memberId)).size !== command.people.length)
      fail(400, "A person is listed twice.");
    const before = structuredClone(state.apps.find((item) => item.id === app.id) ?? null);
    // A member app is shown to every member only after an owner has agreed once. Until then a
    // manager who saves it as Public has asked: the rest of the save applies and it stays Private.
    const made = state.memberApps.find((item) => item.id === app.id);
    let visibility = command.visibility;
    if (made && command.visibility === "public") {
      if (actor.owner) {
        made.publicApproved = true;
        made.publicRequestedBy = null;
      } else if (!made.publicApproved) {
        visibility = "private";
        made.publicRequestedBy = actor.id;
      }
    } else if (made && !made.publicApproved) made.publicRequestedBy = null;
    const settings: AppSettings = {
      id: app.id,
      visibility,
      managers: command.managers,
      people: [...command.people].sort((a, b) => a.memberId.localeCompare(b.memberId)),
    };
    state.apps = [...state.apps.filter((item) => item.id !== app.id), settings];
    return finish(
      state,
      meta,
      actor.id,
      command.type,
      app.id,
      before,
      made
        ? {
            ...settings,
            publicApproved: made.publicApproved,
            publicRequested: made.publicRequestedBy !== null,
          }
        : settings,
    );
  }
  if (command.type === "memberapp.create") {
    if (actor.status !== "active") fail(403, "An active Slice membership is required.");
    const invalid = appIdProblem(command.id, []);
    if (invalid) fail(400, invalid);
    const taken = appIdProblem(command.id, [
      ...apps.map((item) => item.id),
      ...state.memberApps.map((item) => item.id),
    ]);
    if (taken) fail(409, taken);
    if (
      !actor.owner &&
      state.memberApps.filter((item) => item.createdBy === actor.id && !item.deletedAt).length >=
        APP_LIMIT
    )
      fail(403, `You already have ${APP_LIMIT} apps. Delete one first, or ask the Slice owner.`);
    const created: MemberApp = {
      id: command.id,
      name: command.name,
      description: command.description,
      powers: [],
      createdBy: actor.id,
      createdAt: meta.now,
      live: null,
      latest: 0,
      publicApproved: false,
      publicRequestedBy: null,
      deletedAt: null,
    };
    state.memberApps.push(created);
    // Private, run by the person who created it.
    state.apps.push({ id: created.id, visibility: "private", managers: [actor.id], people: [] });
    return finish(state, meta, actor.id, command.type, created.id, null, created);
  }
  if (
    command.type === "memberapp.publish" ||
    command.type === "memberapp.live" ||
    command.type === "memberapp.delete"
  ) {
    const made =
      state.memberApps.find((item) => item.id === command.id && !item.deletedAt) ??
      fail(404, "There is no app with that ID.");
    if (!managesApp(state, actor, made.id))
      fail(403, "Only the people who run this app can change it.");
    const before = structuredClone(made);
    if (command.type === "memberapp.publish") {
      made.name = command.name;
      made.description = command.description;
      made.powers = command.powers;
      made.latest += 1;
      made.live = made.latest;
    } else if (command.type === "memberapp.live") {
      if (command.version !== null && command.version > made.latest)
        fail(400, "That version was never published.");
      made.live = command.version;
    } else {
      made.deletedAt = meta.now;
      made.live = null;
      made.publicRequestedBy = null;
      state.apps = state.apps.filter((item) => item.id !== made.id);
    }
    return finish(state, meta, actor.id, command.type, made.id, before, made);
  }
  requirePermission("members.manage");
  if (command.type === "member.add") {
    if (state.members.some((m) => m.email === command.email))
      fail(409, "A member with this email already exists.");
    canDelegate(levelById(command.levelId).permissions);
    const member: Member = {
      id: meta.id,
      subject: null,
      email: command.email,
      name: command.name,
      title: "",
      status: "invited",
      levelId: command.levelId,
      allow: [],
      deny: [],
      owner: false,
      joinedAt: meta.now,
    };
    state.members.push(member);
    return finish(state, meta, actor.id, command.type, member.id, null, member);
  }
  const target = state.members.find((m) => m.id === command.id) ?? fail(404, "Member not found.");
  if (command.type === "member.remove") {
    // Nobody removes themselves, so the acting manager always remains and an owner who removes
    // another owner is still an active owner afterwards.
    if (target.id === actor.id) fail(400, "You cannot remove yourself.");
    if (target.owner && !actor.owner) fail(403, "Only an owner can make this change.");
    canDelegate(effectivePermissions(state, { ...target, status: "active" }));
    state.members = state.members.filter((m) => m.id !== target.id);
    // A removed person runs nothing and is on no app.
    state.apps = state.apps.map((item) => ({
      ...item,
      managers: item.managers.filter((id) => id !== target.id),
      people: item.people.filter((p) => p.memberId !== target.id),
    }));
    // Their apps stay: an app belongs to Slice, and an owner names a new manager.
    for (const made of state.memberApps)
      if (made.publicRequestedBy === target.id) made.publicRequestedBy = null;
    return finish(state, meta, actor.id, command.type, target.id, target, null);
  }
  if (!actor.owner && (target.id === actor.id || target.owner || command.owner))
    fail(403, "Only an owner can make this change.");
  if (command.levelId) levelById(command.levelId);
  if ((command.status === "active" || command.status === "invited") && !command.levelId)
    fail(400, "Assign an access level before approving a member.");
  if (command.status === "active" && !target.subject)
    fail(400, "Use Invited until this person signs in.");
  if (command.status === "invited" && target.subject)
    fail(400, "This member has already signed in.");
  if (command.owner && command.status !== "active") fail(400, "An owner must be active.");
  const before = structuredClone(target);
  const next = {
    ...target,
    status: command.status,
    levelId: command.levelId,
    allow: command.allow,
    deny: command.deny,
    owner: command.owner,
  };
  canDelegate(effectivePermissions(state, { ...target, status: "active" }));
  canDelegate([
    ...(next.levelId ? levelById(next.levelId).permissions : []),
    ...next.allow,
    ...next.deny,
  ]);
  Object.assign(target, next);
  if (!state.members.some((m) => m.owner && m.status === "active"))
    fail(400, "Keep at least one active owner.");
  return finish(state, meta, actor.id, command.type, target.id, before, target);
}
/** A member without their sign-in account ID, for anything sent to a browser. */
export function memberRecord({ subject, ...member }: Member): MemberRecord {
  return { ...member, signedIn: subject !== null };
}
/**
 * A history entry for display. Entries store whole member records, so the account IDs inside
 * them are replaced the same way before they leave the server.
 */
export function auditView(audit: Audit): Audit {
  const hide = (value: unknown) => {
    if (!value || typeof value !== "object" || !("subject" in value)) return value;
    const { subject, ...rest } = value as { subject: unknown };
    return { ...rest, signedIn: subject !== null };
  };
  return { ...audit, before: hide(audit.before), after: hide(audit.after) };
}
export function memberView(state: State, subject: string): View {
  const me = subjectMember(state, subject);
  const permissions = effectivePermissions(state, me);
  const manage = permissions.includes("members.manage");
  const directory = permissions.includes("members.read") || manage;
  const appViews: AppView[] = apps.map((app) => {
    const settings = settingsFor(state, app.id);
    const canManage = managesApp(state, me, app.id);
    const canOpen = permissions.includes(`app.${app.id}.open`);
    return {
      id: app.id,
      canOpen,
      canManage,
      visibility: settings.visibility,
      // Names only, and only to someone who can already see the member directory or is on this
      // app. Anyone else is told to ask the Slice owner.
      managers:
        directory || canOpen || canManage
          ? state.members
              .filter((m) => m.status === "active" && settings.managers.includes(m.id))
              .map((m) => m.name || "Member")
          : [],
      ...(canManage ? { settings } : {}),
    };
  });
  return {
    revision: state.revision,
    organization: "Slice Consulting",
    me: memberRecord(me),
    permissions,
    members: !directory
      ? []
      : manage
        ? state.members.map(memberRecord)
        : state.members
            .filter((m) => m.status === "active")
            .map((m) => ({
              id: m.id,
              name: m.name || "Member",
              title: m.title,
              levelName: state.levels.find((l) => l.id === m.levelId)?.name ?? "",
            })),
    levels: manage || permissions.includes("levels.manage") ? state.levels : [],
    catalog: manage || permissions.includes("levels.manage") ? organizationPermissions : [],
    apps: appViews,
    ...(appViews.some((app) => app.canManage)
      ? {
          counts: {
            active: state.members.filter((m) => m.status === "active").length,
            invited: state.members.filter((m) => m.status === "invited").length,
          },
        }
      : {}),
  };
}
