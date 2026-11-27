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
/**
 * An app a member made and published through the launcher (docs/member-apps.md). It lives at its
 * own address, `https://<id>.<launcher host>`, and its settings are an AppSettings like any app's.
 */
export interface MemberApp {
  /** Also its address. Never reused, even after the app is deleted. */
  id: string;
  name: string;
  description: string;
  /** Extra powers its managers can give to named people, as its latest version declares them. */
  powers: { id: string; label: string }[];
  /** The member who created it. Kept after they leave; the app belongs to Slice. */
  createdBy: string;
  createdAt: string;
  /** The version people get, or null before the first publish and while it is offline. */
  live: number | null;
  /** How many versions have been published. */
  latest: number;
  /** Set once an owner has saved it as Public. After that its managers can switch it freely. */
  publicApproved: boolean;
  /** The manager waiting for an owner's OK to make it Public, if any. */
  publicRequestedBy: string | null;
  deletedAt: string | null;
  /**
   * Cloudflare's ID for the app's own database, set by the first version published with server
   * code and kept from then on. Null for an app that has only ever had screens.
   */
  database: string | null;
  /**
   * A version only the people who run the app are shown, in place of the live one, so they can
   * try it first. Null when there is none.
   */
  preview: number | null;
  /**
   * What its maker said when they started it on the Build page, so the message for their AI can
   * be written again at any time. Missing or null for an app an AI created.
   */
  brief?: AppBrief | null;
}
/** The two answers the Build page asks for beyond an app's name and what it is for. */
export interface AppBrief {
  audience: "me" | "team" | "everyone";
  /** Whether it has to remember what people enter, or show people each other's entries. */
  saves: boolean;
}
/** One published version of a member app. Its files are in the launcher's file store. */
export interface VersionRecord {
  appId: string;
  version: number;
  at: string;
  /** The member who published it. */
  publishedBy: string;
  /**
   * Where this publish's files are in the launcher's file store. Unique to the publish, so two
   * publishes at the same moment can never write over each other's files.
   */
  store: string;
  /** The Worker this version's server code was uploaded as, or null for screens only. */
  server: { script: string } | null;
  name: string;
  description: string;
  /** Markdown shown on the app's page in the launcher. */
  guide: string;
  powers: { id: string; label: string }[];
  files: { path: string; type: string; size: number }[];
}
export interface State {
  revision: number;
  ownerEmail: string | null;
  ownerClaimed: boolean;
  members: Member[];
  levels: Level[];
  apps: AppSettings[];
  memberApps: MemberApp[];
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
  /** Names of the active members who run the app; empty unless the viewer can see the member
   * directory or is on this app. */
  managers: string[];
  /** The full settings, only for someone who runs the app. */
  settings?: AppSettings;
  /** Set for an app a member made (docs/member-apps.md); built-in apps are in the catalog. */
  member?: {
    name: string;
    description: string;
    /** Whether a version is live. An offline app opens for nobody. */
    live: boolean;
    /** Only for someone who runs the app. */
    manage?: {
      powers: MemberApp["powers"];
      liveVersion: number | null;
      /** The version only the people who run the app are shown, if there is one. */
      preview: number | null;
      latest: number;
      publicApproved: boolean;
      /** The name of the manager waiting for an owner's OK to make it Public, if any. */
      publicRequestedBy: string | null;
      /** What its maker said when they started it on the Build page, if they did. */
      brief: AppBrief | null;
    };
  };
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
  /** One entry per built-in app, then one per member app this person can open or runs. */
  apps: AppView[];
  /** The host member apps live under ("<id>.<appHost>"), or null while they are switched off. */
  appHost: string | null;
  /** How many people making an app public would reach; only for someone who runs an app. */
  counts?: { active: number; invited: number };
  /**
   * For an active member while member apps are on: how many apps they have made, the most they
   * can have (null: no limit), and whether an app can save data yet (server code switched on).
   */
  making?: { used: number; most: number | null; saves: boolean };
}
export class MembershipError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Set when an active member is refused only because they are not on this app. */
    public reason?: "no-app-access",
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
const appDescription = z.string().trim().min(1).max(200);
const appPowers = z
  .array(
    z.strictObject({
      id: z
        .string()
        .max(40)
        .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/, "A power's ID is lower-case, like notes.edit.")
        .refine((value) => value !== "open", "A power cannot be called open."),
      label: name,
    }),
  )
  .max(20)
  .refine(
    (values) => new Set(values.map((power) => power.id)).size === values.length,
    "A power is listed twice.",
  );
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
  // Member apps (docs/member-apps.md). The ID's own rules are checked where it is created, so
  // the refusal can say what is wrong with it.
  z.strictObject({
    type: z.literal("memberapp.create"),
    id: z.string().max(80),
    name,
    description: appDescription,
    /** Set when a person starts the app on the Build page. */
    brief: z
      .strictObject({ audience: z.enum(["me", "team", "everyone"]), saves: z.boolean() })
      .optional(),
  }),
  // One per published version. The version's files are stored before this is saved.
  z.strictObject({
    type: z.literal("memberapp.publish"),
    id,
    name,
    description: appDescription,
    powers: appPowers,
    /** The app's own database, when this version has server code. */
    database: z.string().min(1).max(80).nullable().default(null),
    /** Store the version for the people who run the app only; what is live does not change. */
    preview: z.boolean().default(false),
  }),
  // Which version people get. null takes the app offline and keeps everything else.
  z.strictObject({
    type: z.literal("memberapp.live"),
    id,
    version: z.number().int().positive().nullable(),
    /**
     * What that version called itself, so the app is described by what is live. Filled in by the
     * server from the version's saved record; anything a browser sends here is replaced.
     */
    as: z.strictObject({ name, description: appDescription, powers: appPowers }).optional(),
  }),
  // Which version the people who run the app are shown instead of the live one. null: none.
  z.strictObject({
    type: z.literal("memberapp.preview"),
    id,
    version: z.number().int().positive().nullable(),
  }),
  z.strictObject({ type: z.literal("memberapp.delete"), id }),
]);
export type Command = z.infer<typeof commandSchema>;
