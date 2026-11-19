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

/** Every app there is: the built-in ones, then member apps. */
export function catalogFor(state: State): AppDescriptor[] {
  return [...apps, ...memberApps(state).map(memberAppDescriptor)];
}
