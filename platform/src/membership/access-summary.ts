import type { Member } from "./contracts";

/** Presentation only. Authorization always uses the server's current effective permissions. */
export function organizationRole(
  member: Pick<Member, "owner" | "status">,
  permissions: readonly string[],
) {
  if (member.status !== "active") return "No organization access";
  if (member.owner) return "Admin (owner)";
  if (permissions.includes("members.manage") || permissions.includes("levels.manage"))
    return "Admin";
  if (permissions.includes("audit.read")) return "Activity reviewer";
  return "Member";
}
