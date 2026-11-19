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
import type { AppFiles } from "./files";
import { readBundle } from "./publish";
import { memberApps } from "./registry";
import { APP_LIMIT } from "./rules";

export type MemberAppsDeps = {
  repository: Repository;
  files: AppFiles;
  /** The launcher's own address, e.g. "https://sliceos.app". */
  origin: string;
};

const meta = () => ({ id: crypto.randomUUID(), now: new Date().toISOString() });

export class MemberApps {
  constructor(private deps: MemberAppsDeps) {}

  /** Current membership, for someone who is an active member right now. */
  private async load(identity: Identity): Promise<State> {
    const state = await this.deps.repository.load();
    authorizeMember(state, identity);
    return state;
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
  async publish(identity: Identity, id: string, value: unknown) {
    const bundle = readBundle(value);
    const state = await this.load(identity);
    const stamp = meta();
    const mutation = applyCommand(
      state,
      identity.subject,
      {
        type: "memberapp.publish",
        id,
        name: bundle.name,
        description: bundle.description,
        powers: bundle.powers,
      },
      stamp,
    );
    const app = this.find(mutation.state, id);
    const version: VersionRecord = {
      appId: id,
      version: app.latest,
      at: stamp.now,
      publishedBy: mutation.audit.actorId,
      store: stamp.id,
      name: app.name,
      description: app.description,
      guide: bundle.guide,
      powers: app.powers,
      files: bundle.files.map((file) => ({
        path: file.path,
        type: file.type,
        size: file.body.byteLength,
      })),
    };
    await this.deps.files.put(id, version.store, bundle.files);
    await this.deps.repository.commit(state, mutation, { version });
    return {
      id,
      version: app.latest,
      address: appAddress(this.deps.origin, id),
      live: true,
      files: bundle.files.length,
    };
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
      apps: existing.filter((app) => managesApp(state, member, app.id)).map((app) => this.summary(app)),
      canCreate: member.owner
        ? null
        : Math.max(0, APP_LIMIT - existing.filter((app) => app.createdBy === member.id).length),
    };
  }
}
