// What a member app's page in the launcher shows beyond the membership view: its guide and, for
// the people who run it, its published versions. An app someone is not on is answered exactly
// like one that does not exist.
import { managesApp } from "../membership/app-access";
import { MembershipError } from "../membership/contracts";
import type { Identity } from "../membership/contracts";
import { effectivePermissions } from "../membership/domain";
import type { Repository } from "../membership/repository";
import { authorizeMember } from "../platform/access";
import { memberAppDescriptor, memberApps, shownVersion } from "./registry";

export interface AppInfo {
  /** Markdown from the live version, or from the latest for the people who run an offline app. */
  guide: string;
  versions?: { version: number; at: string; by: string }[];
}

export async function appInfo(
  identity: Identity,
  repository: Repository,
  appId: string,
): Promise<AppInfo> {
  const state = await repository.load();
  const member = authorizeMember(state, identity);
  const app = memberApps(state).find((item) => item.id === appId);
  const runs = app ? managesApp(state, member, app.id) : false;
  if (
    !app ||
    !(
      runs ||
      effectivePermissions(state, member, [memberAppDescriptor(app)]).includes(`app.${appId}.open`)
    )
  )
    throw new MembershipError(404, "App not found.");
  // The guide of the version this person is shown; for the people who run an offline app, the
  // latest one.
  const shown = shownVersion(app, runs) ?? (runs && app.latest ? app.latest : null);
  const guide = shown === null ? "" : ((await repository.version(appId, shown))?.guide ?? "");
  if (!runs) return { guide };
  const name = (memberId: string) =>
    state.members.find((item) => item.id === memberId)?.name || "A former member";
  return {
    guide,
    versions: (await repository.versions(appId, 20)).map((record) => ({
      version: record.version,
      at: record.at,
      by: name(record.publishedBy),
    })),
  };
}
