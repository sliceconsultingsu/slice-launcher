"use client";
import type { StudentProfile } from "../data/reads";
import { APP } from "./client";
import { AddAlumniView } from "./add";
import { AlumView } from "./alum";
import { ConfirmView } from "./confirm";
import { ExplorerView } from "./explorer";
import { MatchesView } from "./matches";
import { ProfileForm } from "./profile-form";
import { ReplyFormView } from "./reply-form";
import { ReviewView } from "./review";
import { LoadError, useLoad } from "./use-load";
import "./alumni.css";

interface Me {
  name: string;
  admin: boolean;
  profile: StudentProfile | null;
}
type View =
  "matches" | "explore" | "alum" | "profile" | "review" | "add" | "confirm" | "reply" | "not-found";

function viewOf(path: string[]): View {
  if (path.length === 0) return "matches";
  if (path.length === 1 && path[0] === "explore") return "explore";
  if (path.length === 2 && path[0] === "alumni") return "alum";
  if (path.length === 1 && path[0] === "profile") return "profile";
  if (path.length === 1 && path[0] === "review") return "review";
  if (path.length === 1 && path[0] === "add") return "add";
  if (path.length === 1 && path[0] === "confirm") return "confirm";
  if (path.length === 3 && path[0] === "alumni" && path[2] === "reply") return "reply";
  return "not-found";
}
const TITLES: Record<View, string> = {
  matches: "Your alumni matches",
  explore: "Explore alumni",
  alum: "Alum profile",
  profile: "My profile",
  review: "Review proposed changes",
  add: "Add alumni",
  confirm: "Confirm alumni details",
  reply: "Record a reply",
  "not-found": "Page not found",
};

/** The whole alumni app. `path` is the part of the address after /apps/alumni. */
export function AlumniApp({ path }: { path: string[] }) {
  const me = useLoad<Me>("me");
  const view = viewOf(path);
  const tabs: { view: View; href: string; label: string }[] = [
    { view: "matches", href: APP, label: "Matches" },
    { view: "explore", href: `${APP}/explore`, label: "Explore alumni" },
    { view: "profile", href: `${APP}/profile`, label: "My profile" },
    ...(me.data?.admin
      ? [
          { view: "review" as const, href: `${APP}/review`, label: "Review changes" },
          { view: "add" as const, href: `${APP}/add`, label: "Add alumni" },
          { view: "confirm" as const, href: `${APP}/confirm`, label: "Confirm details" },
        ]
      : []),
  ];
  const current = view === "alum" ? "explore" : view === "reply" ? "confirm" : view;
  const firstUse = view === "matches" && me.data !== null && !me.data.profile?.complete;
  const name = me.data?.name ?? "";
  const admin = me.data?.admin ?? false;
  return (
    <section className="alumni-workspace" aria-labelledby="alumni-title">
      <p className="eyebrow">Slice Consulting · Alumni</p>
      <h1 id="alumni-title">{firstUse ? "Set up your profile" : TITLES[view]}</h1>
      <p className="notice">
        <strong>Work in progress</strong> · This app is still being built and will change.
      </p>
      <nav className="alumni-tabs" aria-label="Alumni sections">
        {tabs.map((tab) => (
          <a
            key={tab.view}
            href={tab.href}
            aria-current={tab.view === current ? "page" : undefined}
          >
            {tab.label}
          </a>
        ))}
      </nav>
      {me.loading ? (
        <p role="status">Loading the alumni app…</p>
      ) : me.error || !me.data ? (
        <LoadError message={me.error ?? "We couldn’t load the alumni app."} retry={me.reload} />
      ) : view === "not-found" ? (
        <p>
          There is nothing at this address. <a href={APP}>Go to your matches</a>
        </p>
      ) : view === "explore" ? (
        <ExplorerView admin={me.data.admin} />
      ) : view === "alum" ? (
        <AlumView id={path[1] ?? ""} admin={me.data.admin} />
      ) : view === "review" || view === "add" || view === "confirm" || view === "reply" ? (
        admin ? (
          view === "review" ? (
            <ReviewView />
          ) : view === "add" ? (
            <AddAlumniView />
          ) : view === "confirm" ? (
            <ConfirmView />
          ) : (
            <ReplyFormView id={path[1] ?? ""} />
          )
        ) : (
          <p className="notice" role="status">
            Only a Slice admin can open this page.
          </p>
        )
      ) : firstUse && !name ? (
        <p className="notice" role="status">
          Add your name on <a href="/account">your account page</a> first. The alumni app uses it
          for your profile.
        </p>
      ) : firstUse ? (
        // A new student sees the profile form first, then lands on their matches.
        <ProfileForm
          profile={me.data.profile}
          firstUse
          onSaved={() => window.location.assign(APP)}
        />
      ) : view === "profile" ? (
        <ProfileForm
          profile={me.data.profile}
          firstUse={false}
          onSaved={(profile) => me.replace({ name, admin, profile })}
        />
      ) : (
        <MatchesView />
      )}
    </section>
  );
}
