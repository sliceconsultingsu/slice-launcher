// What a member's connected AI can do with member apps: create one, publish a version, and ask
// where things stand. Every call starts from current membership, and every change goes through
// the same commands and history as a change made in the launcher.
import { settingsFor, managesApp } from "../membership/app-access";
import { MembershipError } from "../membership/contracts";
import type { Identity, MemberApp, State, VersionRecord } from "../membership/contracts";
import { applyCommand } from "../membership/domain";
import type { Repository } from "../membership/repository";
import { authorizeMember } from "../platform/access";
import { appAddress } from "../platform/address";
import type { AppCloud } from "./cloud";
import type { AppFiles } from "./files";
import { liveCommand } from "./live";
import { LARGE, readBundle } from "./publish";
import { memberApps } from "./registry";
import { APP_LIMIT } from "./rules";

export type MemberAppsDeps = {
  repository: Repository;
  files: AppFiles;
  /** The launcher's own address, e.g. "https://sliceos.app". */
  origin: string;
  /** Cloudflare, for an app's server code. Left out while server code is switched off. */
  cloud?: AppCloud;
  /** Makes a one-time upload address's token (src/member-apps/uploads.ts). */
  startUpload?: (identity: Identity, appId: string, preview: boolean) => Promise<string>;
};

/** How often one member can publish, and create apps. Every one adds a history entry. */
export const PUBLISHES_PER_HOUR = 30;
export const CREATES_PER_DAY = 10;

const meta = () => ({ id: crypto.randomUUID(), now: new Date().toISOString() });

export class MemberApps {
  constructor(private deps: MemberAppsDeps) {}

  /** Whether an app can include server code (worker.js) and a database of its own. */
  get serverEnabled(): boolean {
    return Boolean(this.deps.cloud);
  }

  /** Current membership, for someone who is an active member right now. */
  private async load(identity: Identity): Promise<State> {
    const state = await this.deps.repository.load();
    authorizeMember(state, identity);
    return state;
  }

  /** Refuses once this member has done this many times since the window began. */
  private async pace(state: State, identity: Identity, action: string, most: number, ms: number) {
    const member = authorizeMember(state, identity);
    const since = new Date(Date.now() - ms).toISOString();
    if ((await this.deps.repository.actionsSince(member.id, action, since)) >= most)
      throw new MembershipError(
        429,
        action === "memberapp.publish"
          ? "You have published many times in the last hour. Try again later."
          : "You have created many apps today. Try again tomorrow.",
      );
  }

  private summary(app: MemberApp) {
    return {
      id: app.id,
      name: app.name,
      address: appAddress(this.deps.origin, app.id),
      page: `${this.deps.origin}/about/${app.id}`,
      live: app.live !== null,
    };
  }

  private find(state: State, id: string): MemberApp {
    return (
      memberApps(state).find((app) => app.id === id) ??
      (() => {
        throw new MembershipError(404, "There is no app with that ID.");
      })()
    );
  }

  /** Reserves the ID and records the caller as the app's first manager. */
  async create(identity: Identity, input: { id: string; name: string; description: string }) {
    const state = await this.load(identity);
    await this.pace(state, identity, "memberapp.create", CREATES_PER_DAY, 86400_000);
    const mutation = applyCommand(
      state,
      identity.subject,
      { type: "memberapp.create", ...input },
      meta(),
    );
    await this.deps.repository.commit(state, mutation);
    return this.summary(this.find(mutation.state, input.id));
  }

  /**
   * Publishes a version and puts it live. The files are stored before the change is saved, so a
   * version is never live without its files. They are stored under a key unique to this publish:
   * if the save is refused (someone else published first), these files are simply never served.
   */
  async publish(
    identity: Identity,
    id: string,
    value: unknown,
    options: { preview?: boolean; large?: boolean } = {},
  ) {
    const preview = options.preview === true;
    const bundle = readBundle(value, { server: this.serverEnabled, large: options.large });
    const state = await this.load(identity);
    await this.pace(state, identity, "memberapp.publish", PUBLISHES_PER_HOUR, 3600_000);
    const stamp = meta();
    const apply = (database: string | null) =>
      applyCommand(
        state,
        identity.subject,
        {
          type: "memberapp.publish",
          id,
          name: bundle.name,
          description: bundle.description,
          powers: bundle.powers,
          database,
          preview,
        },
        stamp,
      );
    // Refuses anyone who does not run the app, and anything invalid, before Cloudflare is asked
    // for anything.
    apply(null);
    let database = this.find(state, id).database;
    let server: VersionRecord["server"] = null;
    if (bundle.server !== null && this.deps.cloud) {
      // One database per app, made by its first version with server code. One Worker per
      // publish, under a name unique to it, so an earlier version can be put live as it was.
      database ??= await this.deps.cloud.ensureDatabase(id);
      server = { script: `${id}-${stamp.id.replaceAll("-", "").slice(0, 16)}` };
      await this.deps.cloud.uploadServer(server.script, bundle.server, database, id);
    }
    const mutation = apply(server ? database : null);
    const app = this.find(mutation.state, id);
    const version: VersionRecord = {
      appId: id,
      version: app.latest,
      at: stamp.now,
      publishedBy: mutation.audit.actorId,
      store: stamp.id,
      server,
      // What this version calls itself. For a preview the app keeps its live description.
      name: bundle.name,
      description: bundle.description,
      guide: bundle.guide,
      powers: bundle.powers,
      files: bundle.files.map((file) => ({
        path: file.path,
        type: file.type,
        size: file.body.byteLength,
      })),
    };
    await this.deps.files.put(id, version.store, [
      ...bundle.files,
      // Kept with the version for the record, under a key the launcher never serves.
      ...(bundle.server === null
        ? []
        : [
            {
              path: "__server/worker.js",
              type: "text/javascript; charset=utf-8",
              body: new TextEncoder().encode(bundle.server),
            },
          ]),
    ]);
    await this.deps.repository.commit(state, mutation, { version });
    return {
      id,
      version: app.latest,
      address: appAddress(this.deps.origin, id),
      live: !preview,
      preview,
      files: bundle.files.length,
      server: server !== null,
    };
  }

  /**
   * A one-time address the member's AI can send the app's files to from a terminal, for an app
   * too large for a tool call. Only for the people who run the app.
   */
  async upload(identity: Identity, id: string, options: { preview?: boolean } = {}) {
    const state = await this.load(identity);
    const app = this.find(state, id);
    if (!managesApp(state, authorizeMember(state, identity), app.id))
      throw new MembershipError(403, "Only the people who run this app can change it.");
    if (!this.deps.startUpload)
      throw new MembershipError(503, "Upload addresses are not available just now.");
    const token = await this.deps.startUpload(identity, id, options.preview === true);
    return {
      address: `${this.deps.origin}/api/app-upload/${token}`,
      minutes: 10,
      files: LARGE.files,
      megabytes: LARGE.bundleBytes / (1024 * 1024),
      preview: options.preview === true,
    };
  }

  /** Puts a published version live, or with null takes the app offline. */
  async setLive(identity: Identity, id: string, version: number | null) {
    const state = await this.load(identity);
    const mutation = applyCommand(
      state,
      identity.subject,
      await liveCommand(this.deps.repository, id, version),
      meta(),
    );
    await this.deps.repository.commit(state, mutation);
    return this.summary(this.find(mutation.state, id));
  }

  /** Where one app stands, for the people who run it. */
  async status(identity: Identity, id: string) {
    const state = await this.load(identity);
    const app = this.find(state, id);
    if (!managesApp(state, authorizeMember(state, identity), id))
      throw new MembershipError(403, "Only the people who run this app can see its status.");
    const settings = settingsFor(state, id);
    const last = app.latest ? await this.deps.repository.version(id, app.latest) : null;
    return {
      ...this.summary(app),
      liveVersion: app.live,
      previewVersion: app.preview ?? null,
      latestVersion: app.latest,
      visibility: settings.visibility,
      waitingForOwner: app.publicRequestedBy !== null,
      people: settings.people.length,
      lastPublished: last
        ? {
            version: last.version,
            at: last.at,
            by:
              state.members.find((member) => member.id === last.publishedBy)?.name ||
              "A former member",
          }
        : null,
    };
  }

  /** The member apps the caller runs, and how many more they can create (null: no limit). */
  async list(identity: Identity) {
    const state = await this.load(identity);
    const member = authorizeMember(state, identity);
    const existing = memberApps(state);
    return {
      apps: existing
        .filter((app) => managesApp(state, member, app.id))
        .map((app) => this.summary(app)),
      canCreate: member.owner
        ? null
        : Math.max(0, APP_LIMIT - existing.filter((app) => app.createdBy === member.id).length),
    };
  }
}
