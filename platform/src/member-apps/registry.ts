// Member apps beside the built-in catalog. Both kinds are described the same way, so who can
// open an app and who runs it are worked out by the same rules (membership/app-access.ts).
import { apps } from "../lib/apps";
import type { MemberApp, State } from "../membership/contracts";
import type { AppDescriptor } from "../platform/contracts";

/** A member app as the permission rules see it. Its extra powers are its only permissions. */
export function memberAppDescriptor(app: MemberApp): AppDescriptor {
  return {
    id: app.id,
    name: app.name,
    description: app.description,
    permissions: app.powers.map(({ id, label }) => ({ id, label })),
  };
}

/** The member apps that exist: created and not deleted. */
export const memberApps = (state: State) => state.memberApps.filter((app) => !app.deletedAt);

/**
 * The version of an app this person is shown. The people who run it get its preview when there
 * is one; everyone else gets what is live. Null: nothing for them to open.
 */
export function shownVersion(app: MemberApp, runs: boolean): number | null {
  const preview = app.preview ?? null;
  return runs && preview !== null ? preview : app.live;
}

/**
 * Whether an owner has agreed to the tools the live version offers. Until then they are offered
 * only to the app's own managers (src/member-apps/app-tools.ts).
 */
export function toolsApproved(app: MemberApp): boolean {
  return Boolean(app.tools && app.toolsApproved?.digest === app.tools.digest);
}

/** Every app there is: the built-in ones, then member apps. */
export function catalogFor(state: State): AppDescriptor[] {
  return [...apps, ...memberApps(state).map(memberAppDescriptor)];
}
