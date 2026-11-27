// What the Build page (docs/member-apps.md) shows, kept apart from React so it can be tested
// directly: where each of a person's apps stands, the address a name suggests, and the message
// that hands an app to their AI. What anyone may do is decided by the server; this only words it.
import type { AppBrief, AppView, View } from "../membership/contracts";
import { memberAppUrl } from "../lib/member-app-model";

/** Where an app stands, in the order a person meets the stages. */
export type Stage = "draft" | "preview" | "live" | "offline";

export interface BuildApp {
  id: string;
  name: string;
  /** What it is for, as its maker or its live version put it. */
  purpose: string;
  stage: Stage;
  /** One sentence on where it stands. */
  line: string;
  /** Its own address, or null while member apps are off. */
  address: string | null;
  /** The version only the people who run it are shown, if there is one. */
  preview: number | null;
  brief: AppBrief | null;
}

export const STAGE_LABEL: Record<Stage, string> = {
  draft: "Draft",
  preview: "Preview ready",
  live: "Live",
  offline: "Offline",
};

const ORDER: Stage[] = ["draft", "preview", "live", "offline"];

function standing(view: AppView): { stage: Stage; line: string } {
  const manage = view.member!.manage!;
  if (manage.latest === 0)
    return { stage: "draft", line: "Waiting for your AI to publish a first preview." };
  if (manage.preview !== null)
    return {
      stage: "preview",
      line:
        manage.liveVersion === null
          ? `Version ${manage.preview} is a preview only the people who run it can see.`
          : `Version ${manage.preview} is a preview. Everyone else still gets version ${manage.liveVersion}.`,
    };
  if (manage.liveVersion === null)
    return { stage: "offline", line: "Offline. Nobody can open it." };
  const others = view.settings?.people.length ?? 0;
  return {
    stage: "live",
    line:
      view.visibility === "public"
        ? `Version ${manage.liveVersion} is live for every member.`
        : others === 0
          ? `Version ${manage.liveVersion} is live, and private to the people who run it.`
          : `Version ${manage.liveVersion} is live, shared with ${others} ${others === 1 ? "person" : "people"}.`,
  };
}

/**
 * The apps this person is named as running, earliest stage first. An owner runs every app, and
 * listing them all here would bury the owner's own, so being an owner is not enough.
 */
export function myApps(view: View): BuildApp[] {
  return view.apps
    .filter(
      (app) => app.member?.manage && app.settings && app.settings.managers.includes(view.me.id),
    )
    .map((app) => ({
      id: app.id,
      name: app.member!.name,
      purpose: app.member!.description,
      ...standing(app),
      address: memberAppUrl(app.id, view.appHost),
      preview: app.member!.manage!.preview,
      brief: app.member!.manage!.brief,
    }))
    .sort(
      (a, b) =>
        ORDER.indexOf(a.stage) - ORDER.indexOf(b.stage) ||
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    );
}

/**
 * An address made from a name: "Kickoff checklist" gives "kickoff-checklist". It may still be
 * refused (too short, reserved, taken); the server says so when the draft is created.
 */
export function suggestId(name: string): string {
  return (
    name
      .normalize("NFKD")
      // Accents come apart from their letters above; dropping them keeps "café" as "cafe".
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^[^a-z]+/, "")
      .slice(0, 32)
      .replace(/-+$/, "")
  );
}

export const AUDIENCE_LABEL: Record<AppBrief["audience"], string> = {
  me: "Just me",
  team: "My project team",
  everyone: "Every member of Slice",
};

const AUDIENCE_SAID: Record<AppBrief["audience"], string> = {
  me: "just me",
  team: "my project team",
  everyone: "every member of Slice, which needs the Slice owner's OK",
};

/** What the page says when someone wants saved data and apps cannot save any yet. */
export const NO_SAVING =
  "Apps cannot save or share data yet. Your AI can still build the part that works in one sitting, such as a checklist, a calculator or a reference page.";

/**
 * The message that hands an app to a member's AI. It names the app that already exists, so the
 * AI publishes to it instead of creating another, and it asks for a preview first.
 */
export function briefFor(
  app: Pick<BuildApp, "id" | "name" | "purpose" | "brief">,
  options: { saves: boolean },
): string {
  const told = [
    `App ID: ${app.id}`,
    `Name: ${app.name}`,
    `What it should help with: ${app.purpose}`,
  ];
  if (app.brief) {
    told.push(`Who it is for: ${AUDIENCE_SAID[app.brief.audience]}`);
    told.push(
      !app.brief.saves
        ? "Saved data: it does not need to remember anything between visits."
        : options.saves
          ? "Saved data: it needs to remember what people enter, or show people each other's entries."
          : "Saved data: I would like it to remember what people enter, or show people each other's entries. Slice apps cannot do that yet, so tell me what can work without it before you build.",
    );
  }
  return `Help me build an app for Slice Consulting. I have already started it on Slice, so it exists there as a draft.

${told.join("\n")}

Call the slice_app_guide tool first and follow it. Do not call slice_app_create: the app exists, so publish to the app ID above.

Before you build anything, ask me what I need, one question at a time. Tell me plainly if my idea needs something a Slice app cannot do. Start with the smallest thing that would help. Publish it as a preview first (slice_app_publish with "preview": true), then tell me to open the Build page on Slice to try it and make it live.`;
}
