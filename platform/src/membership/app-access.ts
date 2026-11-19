// Who can open an app and who runs it. Pure rules over membership state, so pages, app APIs,
// AI tools and the membership screens all get the same answer.
import type { AppDescriptor } from "../platform/contracts";
import type { AppSettings, Member, State } from "./contracts";

/** An app's saved settings, or private with nobody added when none were ever saved. */
export function settingsFor(state: State, appId: string): AppSettings {
  return (
    state.apps.find((item) => item.id === appId) ?? {
      id: appId,
      visibility: "private",
      managers: [],
      people: [],
    }
  );
}

/** Owners run every app; otherwise only the managers listed on it. Never while not active. */
export function managesApp(state: State, member: Member, appId: string): boolean {
  if (member.status !== "active") return false;
  return member.owner || settingsFor(state, appId).managers.includes(member.id);
}

/** The permissions of one app this member holds, as full IDs such as "app.alumni.open". */
export function appPermissions(state: State, member: Member, app: AppDescriptor): string[] {
  if (member.status !== "active") return [];
  const full = (action: string) => `app.${app.id}.${action}`;
  if (managesApp(state, member, app.id))
    return [full("open"), ...app.permissions.map((permission) => full(permission.id))];
  const settings = settingsFor(state, app.id);
  const listed = settings.people.find((person) => person.memberId === member.id);
  if (settings.visibility !== "public" && !listed) return [];
  // A listed power the app no longer declares grants nothing.
  return [
    full("open"),
    ...app.permissions
      .filter((permission) => permission.withAccess || listed?.powers.includes(permission.id))
      .map((permission) => full(permission.id)),
  ];
}
