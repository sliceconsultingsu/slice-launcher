import { z } from "zod";
import { apps } from "../lib/apps";

/** What a member can do across Slice. These come from access levels and individual grants. */
export const organizationPermissions = [
  { id: "members.read", label: "View member directory" },
  { id: "members.manage", label: "Add and manage members" },
  { id: "levels.manage", label: "Create and edit access levels" },
  { id: "audit.read", label: "View access history" },
];
/** Every permission there is. App permissions come only from each app's own settings. */
export const permissionCatalog = [
  ...organizationPermissions,
  ...apps.flatMap((app) => [
    { id: `app.${app.id}.open`, label: `Open ${app.name}` },
    ...app.permissions.map((permission) => ({
      id: `app.${app.id}.${permission.id}`,
      label: `${app.name}: ${permission.label}`,
    })),
  ]),
];
export interface Identity {
  subject: string;
  email: string;
}
/**
 * A person who signed in through a browser, as enrollment sees them. `emailManaged` says whether
 * the sign-in provider manages the address (for Google: Gmail, or a Workspace account whose hosted
 * domain is the address's domain). Only then may the address claim an invitation or the owner seat.
 */
export interface SignedInIdentity extends Identity {
  emailManaged: boolean;
}
export interface Member {
  id: string;
  subject: string | null;
  email: string;
  name: string;
  title: string;
  status: "pending" | "invited" | "active" | "suspended";
  levelId: string | null;
  allow: string[];
  deny: string[];
  owner: boolean;
  joinedAt: string;
}
export interface Level {
  id: string;
  name: string;
  permissions: string[];
}
/**
 * Who can open one app and who runs it, set on the app's own page. An app with no saved settings
 * is private with nobody added, so only owners can open it.
 */
export interface AppSettings {
  id: string;
  /** Public: every active member. Private: only the people listed. */
  visibility: "private" | "public";
  /** Member IDs. A manager can change these settings and holds all of the app's permissions. */
  managers: string[];
  /** Member IDs with the extra powers each was given, as the app declares them (e.g. "admin"). */
  people: { memberId: string; powers: string[] }[];
}
export interface State {
  revision: number;
  ownerEmail: string | null;
  ownerClaimed: boolean;
  members: Member[];
  levels: Level[];
  apps: AppSettings[];
}
export interface Audit {
  id: string;
  at: string;
  actorId: string;
  action: string;
  targetId: string;
  before: unknown;
  after: unknown;
}
export interface Mutation {
  state: State;
  audit: Audit;
}
export interface Meta {
  id: string;
  now: string;
}
/**
 * A member as the app shows them. The sign-in provider's account ID stays on the server; the
 * app only needs to know whether the person has signed in yet.
 */
export type MemberRecord = Omit<Member, "subject"> & { signedIn: boolean };
export interface DirectoryMember {
  id: string;
  name: string;
  title: string;
  levelName: string;
}
/** What one person is told about one app: enough to draw their launcher and the app's page. */
export interface AppView {
  id: string;
  canOpen: boolean;
  canManage: boolean;
  visibility: AppSettings["visibility"];
  /** Names of the active members who run the app; empty unless the viewer is an active member. */
  managers: string[];
  /** The full settings, only for someone who runs the app. */
  settings?: AppSettings;
}
export interface View {
  revision: number;
  organization: string;
  me: MemberRecord;
  permissions: string[];
  members: (DirectoryMember | MemberRecord)[];
  levels: Level[];
  /** The organization permissions a level or member can be given. */
  catalog: typeof organizationPermissions;
  /** One entry per app in the catalog. */
  apps: AppView[];
  /** How many people making an app public would reach; only for someone who runs an app. */
  counts?: { active: number; invited: number };
}
export class MembershipError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
// Levels and individual grants carry organization permissions only; app access is set on the app.
const permission = z
  .string()
  .refine(
    (value) => organizationPermissions.some((item) => item.id === value),
    "Unknown permission",
  );
const permissions = z
  .array(permission)
  .max(100)
  .transform((values) => [...new Set(values)].sort());
const id = z.string().min(1).max(80);
const name = z.string().trim().min(1).max(80);
export const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("profile.update"), name, title: z.string().trim().max(100) }),
  z.strictObject({ type: z.literal("member.add"), email: emailSchema, name, levelId: id }),
  z.strictObject({
    type: z.literal("member.update"),
    id,
    status: z.enum(["pending", "invited", "active", "suspended"]),
    levelId: id.nullable(),
    allow: permissions,
    deny: permissions,
    owner: z.boolean(),
  }),
  z.strictObject({ type: z.literal("member.remove"), id }),
  z.strictObject({ type: z.literal("level.save"), id: id.optional(), name, permissions }),
  // The whole settings document for one app, like member.update and level.save.
  z.strictObject({
    type: z.literal("app.update"),
    id,
    visibility: z.enum(["private", "public"]),
    managers: z
      .array(id)
      .max(50)
      .transform((values) => [...new Set(values)].sort()),
    people: z
      .array(
        z.strictObject({
          memberId: id,
          powers: z
            .array(z.string().min(1).max(80))
            .max(20)
            .transform((values) => [...new Set(values)].sort()),
        }),
      )
      .max(1000),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
