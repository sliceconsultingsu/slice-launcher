import { MembershipError } from "../membership/contracts";
import type { Identity, State } from "../membership/contracts";
import { effectivePermissions } from "../membership/domain";
import type { AppContext, AppDescriptor } from "./contracts";

export function authorizeMember(state: State, identity: Identity) {
  const member = state.members.find((item) => item.subject === identity.subject);
  if (!member || member.email !== identity.email || member.status !== "active")
    throw new MembershipError(403, "An active Slice membership is required. Visit your account.");
  return member;
}

export function authorizeApp(state: State, identity: Identity, app: AppDescriptor): AppContext {
  const member = authorizeMember(state, identity);
  const permissions = effectivePermissions(state, member);
  if (!permissions.includes(`app.${app.id}.open`))
    throw new MembershipError(403, "You do not have access to this application.");
  return {
    appId: app.id,
    member: Object.freeze({ id: member.id, name: member.name, email: member.email }),
    permissions: Object.freeze(permissions.filter((value) => value.startsWith(`app.${app.id}.`))),
    requirePermission(action) {
      if (
        !app.permissions.some((permission) => permission.id === action) ||
        !permissions.includes(`app.${app.id}.${action}`)
      )
        throw new MembershipError(403, "You do not have permission for this action.");
    },
  };
}
