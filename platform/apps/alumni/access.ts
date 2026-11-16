// Who is asking. The platform has already verified the member and their access to this app.
import type { AppContext } from "../../src/platform/contracts";
import type { Viewer } from "./data/reads";

/** True for a member who holds the app's admin permission. Owners inherit it. */
export function isAdmin(context: AppContext): boolean {
  return context.permissions.includes(`app.${context.appId}.admin`);
}

export function viewerOf(context: AppContext): Viewer {
  return { memberId: context.member.id, admin: isAdmin(context) };
}
