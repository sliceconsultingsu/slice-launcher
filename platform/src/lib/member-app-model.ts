// How apps members made (docs/member-apps.md) appear in the launcher, kept apart from React so it
// can be tested directly. What anyone may do is decided by the server; this only words it.
import type { AppView } from "../membership/contracts";
import type { VisibleApp } from "./app-grid-view";
import type { LauncherApp } from "./apps";

/** Member apps share one icon: they have no icon file in this repository. */
export const MEMBER_APP_ICON = "/brand/member-app.svg";

/** A member app described like a built-in one, or null for a built-in app. */
export function memberLauncherApp(view: AppView): LauncherApp | null {
  if (!view.member) return null;
  return {
    id: view.id,
    name: view.member.name,
    description: view.member.description,
    icon: MEMBER_APP_ICON,
    // Its extra powers are its only permissions; only the people who run it are told them.
    permissions: (view.member.manage?.powers ?? []).map(({ id, label }) => ({ id, label })),
  };
}

/** A member app's own address, or null while member apps are off. */
export const memberAppUrl = (id: string, appHost: string | null) =>
  appHost ? `https://${id}.${appHost}` : null;

/** Tiles for the member apps this person was told about, by name. */
export function memberTiles(told: readonly AppView[], appHost: string | null): VisibleApp[] {
  if (!appHost) return [];
  const tiles: VisibleApp[] = [];
  for (const view of told) {
    const app = memberLauncherApp(view);
    if (!app || !view.member || !(view.canOpen || view.canManage)) continue;
    // The people who run an app can open its preview even while nothing is live.
    const openable = view.member.live || (view.member.manage?.preview ?? null) !== null;
    tiles.push({
      app,
      isPrivate: view.visibility === "private",
      href: openable ? memberAppUrl(view.id, appHost) : null,
      ...(openable ? {} : { unavailable: "Offline" }),
    });
  }
  return tiles.sort((a, b) => a.app.name.localeCompare(b.app.name, "en", { sensitivity: "base" }));
}

/** For an owner: the member apps whose managers asked to make them Public. */
export function waitingForOwner(told: readonly AppView[], owner: boolean) {
  if (!owner) return [];
  return told.flatMap((view) =>
    view.member?.manage?.publicRequestedBy
      ? [{ id: view.id, name: view.member.name, by: view.member.manage.publicRequestedBy }]
      : [],
  );
}

/** For an owner: the member apps whose live tools nobody has agreed to yet. */
export function toolsWaitingForOwner(told: readonly AppView[], owner: boolean) {
  if (!owner) return [];
  return told.flatMap((view) =>
    view.member?.manage?.tools && !view.member.manage.tools.approved
      ? [{ id: view.id, name: view.member.name, count: view.member.manage.tools.count }]
      : [],
  );
}

/**
 * What saving an app as Public does. "free": it becomes Public. "ask": it stays Private and the
 * owner is asked. "approve": an owner's save is the one-time OK.
 */
export type PublicRule = "free" | "ask" | "approve";
export function publicRule(view: AppView, owner: boolean): PublicRule {
  const manage = view.member?.manage;
  if (!manage || manage.publicApproved) return "free";
  return owner ? "approve" : "ask";
}

/** The line under the Public choice. */
export function publicNote(rule: PublicRule, requestedBy: string | null): string {
  const everyone = "Every active member of Slice";
  if (rule === "ask")
    return requestedBy
      ? `${everyone}. Waiting for the Slice owner's OK.`
      : `${everyone}. This needs the Slice owner's OK: saving asks them, and the app stays Private until they agree.`;
  if (rule === "approve" && requestedBy)
    return `${everyone}. ${requestedBy} asked for this; saving it as Public agrees, once and for later versions too.`;
  if (rule === "approve")
    return `${everyone}. Saving it as Public is your OK, once and for later versions too.`;
  return everyone;
}
