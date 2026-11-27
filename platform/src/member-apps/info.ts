// What a member app's page in the launcher shows beyond the membership view: its guide, the tools
// it offers to a member's AI and, for the people who run it, its published versions. An app
// someone is not on is answered exactly like one that does not exist.
import { managesApp } from "../membership/app-access";
import { MembershipError } from "../membership/contracts";
import type { Identity } from "../membership/contracts";
import { effectivePermissions } from "../membership/domain";
import type { Repository } from "../membership/repository";
import { authorizeMember } from "../platform/access";
import { offeredName } from "./app-tools";
import { memberAppDescriptor, memberApps, shownVersion, toolsApproved } from "./registry";

/** One tool as the app's page lists it. */
export interface ToolInfo {
  /** The name a member's AI calls it by. */
  name: string;
  description: string;
  readOnly: boolean;
  /** The label of the extra power a person needs, or null: anyone who can open the app. */
  power: string | null;
  /** What it takes, as the AI is told. Only for the people who run the app. */
  input?: unknown;
}
export interface AppInfo {
  /** Markdown from the live version, or from the latest for the people who run an offline app. */
  guide: string;
  versions?: { version: number; at: string; by: string }[];
  /**
   * The tools the live version offers to a member's AI. Someone who merely opens the app is told
   * of them only once an owner has agreed to them; the people who run it always are, with the
   * fingerprint an owner's OK is given for.
   */
  tools?: { list: ToolInfo[]; approved: boolean; digest?: string };
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
  // Tools are agreed to, and offered to other people, for the live version only.
  const approved = toolsApproved(app);
  const live =
    app.live !== null && app.tools && (runs || approved)
      ? await repository.version(appId, app.live)
      : null;
  const tools: Pick<AppInfo, "tools"> = live?.tools?.length
    ? {
        tools: {
          list: live.tools.map((tool) => ({
            name: offeredName(appId, tool.name),
            description: tool.description,
            readOnly: tool.readOnly,
            power:
              tool.power === null
                ? null
                : (live.powers.find((power) => power.id === tool.power)?.label ?? tool.power),
            ...(runs ? { input: tool.input } : {}),
          })),
          approved,
          ...(runs ? { digest: app.tools!.digest } : {}),
        },
      }
    : {};
  if (!runs) return { guide, ...tools };
  const name = (memberId: string) =>
    state.members.find((item) => item.id === memberId)?.name || "A former member";
  return {
    guide,
    ...tools,
    versions: (await repository.versions(appId, 20)).map((record) => ({
      version: record.version,
      at: record.at,
      by: name(record.publishedBy),
    })),
  };
}
