// Production wiring for member apps: whether they are switched on, and where things live.
import { env } from "cloudflare:workers";
import { Repository } from "../membership/repository";
import { kvFiles, type AppFiles } from "./files";
import { createFrontDoor } from "./front-door";
import type { PassDeps } from "./pass-route";
import { MemberApps } from "./service";

type MemberAppsEnv = {
  MEMBER_APPS_ENABLED?: string;
  LAUNCHER_ORIGIN?: string;
  /** The launcher's file store. Bound when member apps are switched on. */
  APP_FILES?: KVNamespace;
  MEMBERSHIP_DB: D1Database;
};

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
  });
}
