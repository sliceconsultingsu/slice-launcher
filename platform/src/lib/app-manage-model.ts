// The app page's logic, kept apart from React so it can be tested directly: how a manager's
// edits build the settings to save, who they can see and pick, and what the page shows.
import type { AppSettings, AppView, Command, View } from "../membership/contracts";
import type { NeedsProfile } from "../membership/membership-client";
import type { LauncherApp } from "./apps";

export function addPerson(draft: AppSettings, memberId: string): AppSettings {
  if (draft.people.some((person) => person.memberId === memberId)) return draft;
  return { ...draft, people: [...draft.people, { memberId, powers: [] }] };
}
export function removePerson(draft: AppSettings, memberId: string): AppSettings {
  return { ...draft, people: draft.people.filter((person) => person.memberId !== memberId) };
}
export function setPower(
  draft: AppSettings,
  memberId: string,
  power: string,
  on: boolean,
): AppSettings {
  return {
    ...draft,
    people: draft.people.map((person) =>
      person.memberId !== memberId
        ? person
        : {
            ...person,
            powers: on
              ? [...new Set([...person.powers, power])]
              : person.powers.filter((item) => item !== power),
          },
    ),
  };
}
export function addManager(draft: AppSettings, memberId: string): AppSettings {
  if (draft.managers.includes(memberId)) return draft;
  return { ...draft, managers: [...draft.managers, memberId] };
}
export function removeManager(draft: AppSettings, memberId: string): AppSettings {
  return { ...draft, managers: draft.managers.filter((id) => id !== memberId) };
}

/** The whole settings as one save; the server tidies and checks them. */
export function toCommand(draft: AppSettings): Command {
  return { type: "app.update", ...draft };
}

/** Opening a private app to everyone is the one change that asks first. */
export function needsPublicConfirmation(saved: AppSettings, draft: AppSettings): boolean {
  return saved.visibility === "private" && draft.visibility === "public";
}
/** Whether to ask first. A save that only asks the owner opens nothing, so it does not. */
export function confirmsPublic(
  saved: AppSettings,
  draft: AppSettings,
  rule: "free" | "ask" | "approve",
): boolean {
  return rule !== "ask" && needsPublicConfirmation(saved, draft);
}
export function publicConfirmation(
  appName: string,
  counts: { active: number; invited: number },
): string {
  const active = counts.active === 1 ? "1 active member" : `all ${counts.active} active members`;
  const invited =
    counts.invited === 0
      ? ""
      : `, and to ${counts.invited} invited ${counts.invited === 1 ? "person" : "people"} as they sign in`;
  return `This opens ${appName} to ${active}${invited}.`;
}

/** A name from the member list this person can already see; never an ID or an address. */
export function displayName(view: View, memberId: string): string {
  const member = view.members.find((item) => item.id === memberId);
  return member ? member.name || "Member" : "Invited member";
}

/** Members who can still be added. An address is shown only if this person could already see it. */
export function candidates(view: View, taken: readonly string[]): { id: string; label: string }[] {
  return view.members
    .filter((member) => !taken.includes(member.id))
    .map((member) => ({
      id: member.id,
      label: `${member.name || "Member"}${"email" in member ? ` (${member.email})` : ""}`,
    }));
}

/** The powers a manager gives to named people; what comes with access is not a choice. */
export function extraPowers(app: LauncherApp): { id: string; label: string }[] {
  return app.permissions
    .filter((permission) => !permission.withAccess)
    .map(({ id, label }) => ({ id, label }));
}

/**
 * The settings a manager starts editing from. A power the app no longer declares is dropped
 * here, because the server refuses a save that names one and the form has no box to untick.
 */
export function startingDraft(
  settings: AppSettings,
  app: LauncherApp,
  /** A request to make a member app Public is waiting: start on Public, so a save asks again. */
  publicRequested = false,
): AppSettings {
  const declared = extraPowers(app).map((power) => power.id);
  return {
    ...settings,
    visibility: publicRequested ? "public" : settings.visibility,
    people: settings.people.map((person) => ({
      ...person,
      powers: person.powers.filter((power) => declared.includes(power)),
    })),
  };
}

export type AboutState =
  /** No member profile yet, or membership is not active. */
  | { kind: "inactive" }
  /** An active member who is not on this app. */
  | { kind: "private"; managers: string[] }
  | { kind: "open"; app: AppView };

export function aboutState(view: View | NeedsProfile, appId: string): AboutState {
  if ("needsEnrollment" in view || view.me.status !== "active") return { kind: "inactive" };
  const app = view.apps.find((item) => item.id === appId);
  if (!app || !(app.canOpen || app.canManage))
    return { kind: "private", managers: app?.managers ?? [] };
  return { kind: "open", app };
}
