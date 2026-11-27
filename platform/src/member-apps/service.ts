// What a member's connected AI can do with member apps: create one, publish a version, and ask
// where things stand. Every call starts from current membership, and every change goes through
// the same commands and history as a change made in the launcher.
import { settingsFor, managesApp } from "../membership/app-access";
import { MembershipError } from "../membership/contracts";
import type {
  AppToolDeclaration,
  Identity,
  Member,
  MemberApp,
  State,
  VersionRecord,
} from "../membership/contracts";
import { applyCommand, effectivePermissions } from "../membership/domain";
import type { Repository } from "../membership/repository";
import { authorizeMember } from "../platform/access";
import { appAddress } from "../platform/address";
import {
  MAX_TOOL_INPUT_BYTES,
  MAX_TOOL_RESULT_BYTES,
  offeredDescription,
  offeredName,
  TOOL_MILLISECONDS,
  toolsDigest,
} from "./app-tools";
import { setAsking } from "./asking";
import type { AppCloud } from "./cloud";
import type { AppFiles } from "./files";
import { readUpTo } from "./front-door";
import { liveCommand } from "./live";
import { LARGE, readBundle } from "./publish";
import { memberAppDescriptor, memberApps, shownVersion, toolsApproved } from "./registry";
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
  /**
   * The Worker a version's server code was uploaded as, by name. An app's tools are answered by
   * it. Left out while server code is switched off.
   */
  server?: (script: string) => { fetch(request: Request): Promise<Response> } | null;
  /** A saved version record. Records never change, so this may remember them between requests. */
  version?: (appId: string, version: number) => Promise<VersionRecord | null>;
  /** How long a tool has to answer, in milliseconds. Left out except in tests. */
  toolMilliseconds?: number;
};

/** One tool of a member app, as one person's AI is offered it. */
export type OfferedTool = {
  appId: string;
  /** The name the AI calls it by: "<app id>__<tool>". */
  name: string;
  description: string;
  tool: AppToolDeclaration;
};

/** The most member-app tools one person's AI is offered. Apps are taken in order of their IDs. */
export const MAX_OFFERED_TOOLS = 60;

const plainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
    const digest = await toolsDigest(bundle.tools);
    const tools = digest ? { digest, count: bundle.tools.length } : null;
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
          tools,
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
      ...(tools ? { tools: bundle.tools, toolsDigest: tools.digest } : {}),
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
      ...(tools
        ? {
            tools: tools.count,
            toolsNote: preview
              ? "Only the people named as running this app are offered a preview's tools."
              : toolsApproved(app)
                ? "The Slice owner already agreed to these tools, so the people this app is shared with are offered them."
                : "Only the people named as running this app are offered its tools until a Slice owner agrees to them on the app's page. Changing a tool's name, description, input or power needs that OK again.",
          }
        : {}),
    };
  }

  private version(appId: string, version: number) {
    return (this.deps.version ?? ((id, v) => this.deps.repository.version(id, v)))(appId, version);
  }

  /**
   * The tools of one app this person is offered right now, with the version that answers them,
   * or null with none. Used both to list tools and, with membership read again, to run one.
   *
   * Owners run every app, but tools nobody has agreed to go only to the managers named on the
   * app: otherwise every member's unread tool descriptions would land in the owner's AI, which
   * can reach the most. Named managers get the tools of the version they are shown, a preview
   * included. Everyone else gets the live version's tools, and only once an owner has agreed to
   * exactly those.
   */
  private async toolsOf(state: State, member: Member, app: MemberApp) {
    const permissions = effectivePermissions(state, member, [memberAppDescriptor(app)]);
    if (!permissions.includes(`app.${app.id}.open`)) return null;
    const named = settingsFor(state, app.id).managers.includes(member.id);
    const shown = named ? shownVersion(app, true) : app.live;
    if (shown === null) return null;
    if (!named && !toolsApproved(app)) return null;
    // The live version's tools are known without reading its record; a preview's are not.
    if (shown === app.live && !app.tools) return null;
    const record = await this.version(app.id, shown);
    if (!record?.server || !record.tools?.length) return null;
    if (!named && record.toolsDigest !== app.toolsApproved?.digest) return null;
    return {
      record,
      server: record.server,
      runs: managesApp(state, member, app.id),
      permissions,
      // A named manager holds every power, including one only the preview declares.
      tools: record.tools.filter(
        (tool) =>
          named || tool.power === null || permissions.includes(`app.${app.id}.${tool.power}`),
      ),
    };
  }

  /** The member-app tools this person's AI is offered, from the membership already loaded. */
  async offeredTools(state: State, identity: Identity): Promise<OfferedTool[]> {
    if (!this.deps.server) return [];
    const member = authorizeMember(state, identity);
    const offered: OfferedTool[] = [];
    const apps = memberApps(state).sort((a, b) => a.id.localeCompare(b.id));
    for (const app of apps) {
      const found = await this.toolsOf(state, member, app);
      for (const tool of found?.tools ?? []) {
        if (offered.length >= MAX_OFFERED_TOOLS) return offered;
        offered.push({
          appId: app.id,
          name: offeredName(app.id, tool.name),
          description: offeredDescription(app.id, tool),
          tool,
        });
      }
    }
    return offered;
  }

  /**
   * Runs one tool for this person. Membership, access to the app, the owner's OK and the power
   * are all worked out again here, so a change made since the tools were listed applies. The
   * call goes to the app's own server code at an address no browser can reach, with who is
   * asking set by the launcher. A refusal thrown here is worded for the AI.
   */
  async callTool(
    identity: Identity,
    appId: string,
    name: string,
    input: unknown,
  ): Promise<Record<string, unknown>> {
    const state = await this.load(identity);
    const member = authorizeMember(state, identity);
    const app = memberApps(state).find((item) => item.id === appId);
    const found = app ? await this.toolsOf(state, member, app) : null;
    const tool = found?.tools.find((item) => item.name === name);
    if (!found || !tool) throw new MembershipError(403, "You can no longer use this tool.");
    const worker = this.deps.server?.(found.server.script) ?? null;
    if (!worker) throw new MembershipError(503, "This app's server code is switched off.");
    const body = JSON.stringify(input ?? {});
    if (new TextEncoder().encode(body).byteLength > MAX_TOOL_INPUT_BYTES)
      throw new MembershipError(413, "That is too much to send to a tool in one call.");
    const headers = setAsking(
      new Headers({ "Content-Type": "application/json" }),
      appId,
      member,
      found.runs,
      found.permissions,
    );
    const failed = () => new MembershipError(502, "This app's tool failed. Its maker can fix it.");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let answered: Response;
    let read: ArrayBuffer | null;
    try {
      answered = await Promise.race([
        worker.fetch(
          new Request(`${appAddress(this.deps.origin, appId)}/__slice/tools/${tool.name}`, {
            method: "POST",
            headers,
            body,
            redirect: "manual",
          }),
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("timeout")),
            this.deps.toolMilliseconds ?? TOOL_MILLISECONDS,
          );
        }),
      ]);
      read = await readUpTo(answered, MAX_TOOL_RESULT_BYTES);
    } catch {
      // What went wrong inside the app's code is the app's; it is not passed on.
      throw failed();
    } finally {
      clearTimeout(timer);
    }
    if (read === null)
      throw new MembershipError(502, "This app's tool answered with more than can be passed on.");
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(read));
    } catch {
      throw failed();
    }
    if (!plainObject(value)) throw failed();
    if (answered.ok) return value;
    // The app refusing in its own words (no such entry, not allowed) is useful to the AI.
    if (answered.status >= 400 && answered.status < 500 && typeof value.error === "string")
      throw new MembershipError(422, `The app refused: ${value.error.slice(0, 300)}`);
    throw failed();
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
      // Until an owner agrees, an app's tools are offered only to the people named as running it.
      tools: app.tools ? { count: app.tools.count, approvedByOwner: toolsApproved(app) } : null,
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
