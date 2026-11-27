// Production wiring for member apps: whether they are switched on, and where things live.
import { env } from "cloudflare:workers";
import { Repository } from "../membership/repository";
import { cloudflareApps, type AppCloud } from "./cloud";
import { kvFiles, type AppFiles } from "./files";
import { createFrontDoor } from "./front-door";
import type { PassDeps } from "./pass-route";
import { MemberApps } from "./service";
import { startUpload } from "./uploads";

type MemberAppsEnv = {
  MEMBER_APPS_ENABLED?: string;
  LAUNCHER_ORIGIN?: string;
  /** The launcher's file store. Bound when member apps are switched on. */
  APP_FILES?: KVNamespace;
  MEMBERSHIP_DB: D1Database;
  /**
   * Server code for member apps: the dispatch namespace their Workers live in, and the two
   * secrets the launcher uses to upload them (wrangler secret put; never in wrangler.jsonc).
   * All three are set when server code is switched on.
   */
  APPS?: DispatchNamespace;
  APPS_ACCOUNT_ID?: string;
  APPS_API_TOKEN?: string;
};

/** The dispatch namespace's name. It must match the APPS binding in platform/wrangler.jsonc. */
const APPS_NAMESPACE = "slice-apps";
/** What one request to an app's server code may use. */
const SERVER_LIMITS = { cpuMs: 50, subRequests: 50 };

/** Cloudflare, for uploading an app's server code, or undefined while that is switched off. */
function appCloud(source: MemberAppsEnv): AppCloud | undefined {
  if (!source.APPS || !source.APPS_ACCOUNT_ID || !source.APPS_API_TOKEN) return undefined;
  return cloudflareApps({
    accountId: source.APPS_ACCOUNT_ID,
    token: source.APPS_API_TOKEN,
    namespace: APPS_NAMESPACE,
  });
}

/** Whether an app can include server code and a database of its own: the second switch. */
export function memberAppServerEnabled(source: MemberAppsEnv = env as unknown as MemberAppsEnv) {
  return memberAppsEnabled(source) && appCloud(source) !== undefined;
}

/** On only when the setting is exactly "true" and the file store is bound. */
export function memberAppsEnabled(source: MemberAppsEnv = env as unknown as MemberAppsEnv) {
  return String(source.MEMBER_APPS_ENABLED) === "true" && Boolean(source.APP_FILES);
}

/** The launcher's file store, or null while member apps are switched off. */
export function appFiles(source: MemberAppsEnv = env as unknown as MemberAppsEnv): AppFiles | null {
  return memberAppsEnabled(source) && source.APP_FILES ? kvFiles(source.APP_FILES) : null;
}

/** The launcher's configured address, or the address this request came to. */
export function launcherOrigin(
  request: Request,
  source: MemberAppsEnv = env as unknown as MemberAppsEnv,
): string {
  try {
    const url = new URL(String(source.LAUNCHER_ORIGIN));
    if (url.protocol === "https:" && url.origin === source.LAUNCHER_ORIGIN) return url.origin;
  } catch {
    // Not configured: fall through.
  }
  return new URL(request.url).origin;
}

export function passDeps(request: Request): PassDeps {
  const source = env as unknown as MemberAppsEnv;
  return {
    db: source.MEMBERSHIP_DB,
    loadState: () => new Repository(source.MEMBERSHIP_DB).load(),
    origin: launcherOrigin(request, source),
    enabled: memberAppsEnabled(source),
  };
}

let door: ReturnType<typeof createFrontDoor> | undefined;
/**
 * Answers a request to a member app's address, or null while member apps are switched off.
 * The Worker entry calls this with the request it was given, for any path at that address.
 */
export function memberAppRequest(
  request: Request,
  source: MemberAppsEnv,
  appId: string,
): Promise<Response> | null {
  const files = appFiles(source);
  if (!files) return null;
  const repository = new Repository(source.MEMBERSHIP_DB);
  door ??= createFrontDoor({
    db: source.MEMBERSHIP_DB,
    loadState: () => repository.load(),
    version: (id, version) => repository.version(id, version),
    files,
    origin: launcherOrigin(request, source),
    // Each version's server code is its own Worker in the dispatch namespace. Every call it
    // makes to anywhere else goes to the outbound Worker bound to the namespace, which refuses.
    ...(source.APPS
      ? { server: (script: string) => source.APPS!.get(script, {}, { limits: SERVER_LIMITS }) }
      : {}),
  });
  return door(request, appId);
}

/** What the AI tools use to create and publish apps, or undefined while member apps are off. */
export function memberAppsService(request: Request, source: MemberAppsEnv): MemberApps | undefined {
  const files = appFiles(source);
  if (!files) return undefined;
  return new MemberApps({
    repository: new Repository(source.MEMBERSHIP_DB),
    files,
    origin: launcherOrigin(request, source),
    cloud: appCloud(source),
    startUpload: (identity, appId, preview) =>
      startUpload(source.MEMBERSHIP_DB, identity, appId, preview),
  });
}
