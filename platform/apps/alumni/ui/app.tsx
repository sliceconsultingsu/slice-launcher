"use client";
import type { StudentProfile } from "../data/reads";
import type { MyMatches } from "../matching/mine";
import { AddAlumniView } from "./add";
import { AlumView } from "./alum";
import { AnswersView } from "./answers";
import { APP } from "./client";
import { ConfirmView } from "./confirm";
import { ExplorerView } from "./explorer";
import { HomeView } from "./home";
import { ManageView } from "./manage";
import { MatchesView } from "./matches";
import { waiting } from "./mine";
import { Tile } from "./people";
import { ReplyFormView } from "./reply-form";
import { ReviewView } from "./review";
import { LoadError, useLoad } from "./use-load";
import "./alumni.css";

// The two typefaces of the alumni look. The browser fetches them from Google Fonts; if that
// fails, the screens fall back to the launcher's own font and still work.
const FONTS =
  "https://fonts.googleapis.com/css2?family=League+Spartan:wght@700;800&family=DM+Sans:wght@400;500;700&display=swap";

interface Me {
  name: string;
  admin: boolean;
  profile: StudentProfile | null;
}
type View =
  | "home"
  | "matches"
  | "explore"
  | "alum"
  | "profile"
  | "manage"
  | "review"
  | "add"
  | "confirm"
  | "reply"
  | "not-found";
const ADMIN_VIEWS: View[] = ["manage", "review", "add", "confirm", "reply"];

function viewOf(path: string[]): View {
  const [first, , third] = path;
  if (path.length === 0) return "home";
  if (path.length === 2 && first === "alumni") return "alum";
  if (path.length === 3 && first === "alumni" && third === "reply") return "reply";
  if (path.length !== 1) return "not-found";
  if (first === "matches" || first === "explore" || first === "profile") return first;
  if (first === "manage" || first === "review" || first === "add" || first === "confirm")
    return first;
  return "not-found";
}

/** The whole alumni app. `path` is the part of the address after /apps/alumni. */
export function AlumniApp({ path }: { path: string[] }) {
  const me = useLoad<Me>("me");
  // Opening the app also gives the student their next set of matches when one is due.
  const mine = useLoad<MyMatches>("me/matches", "POST");
  const view = viewOf(path);
  const admin = me.data?.admin ?? false;
  const name = me.data?.name ?? "";
  const firstUse =
    (view === "home" || view === "matches") && me.data !== null && !me.data.profile?.complete;
  const section = view === "alum" ? "explore" : ADMIN_VIEWS.includes(view) ? "manage" : view;
  const left = waiting(mine.data?.matches ?? []).length;
  const tabs = [
    { id: "home", href: APP, label: "Home", count: 0 },
    { id: "matches", href: `${APP}/matches`, label: "Matches", count: left },
    { id: "explore", href: `${APP}/explore`, label: "Network", count: 0 },
    ...(admin ? [{ id: "manage", href: `${APP}/manage`, label: "Manage", count: 0 }] : []),
  ];

  return (
    <section className="alumni-workspace" aria-label="Slice alumni">
      <link rel="stylesheet" href={FONTS} precedence="default" />
      <div className="al-bar">
        <a className="al-brand" href={APP}>
          SLICE ALUMNI
        </a>
        {firstUse ? (
          <a className="al-more" href={`${APP}/explore`}>
            Skip for now and browse the network
          </a>
        ) : (
          <>
            <nav className="al-nav" aria-label="Alumni sections">
              {tabs.map((tab) => (
                <a
                  key={tab.id}
                  href={tab.href}
                  aria-current={tab.id === section ? "page" : undefined}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className="al-count">
                      {tab.count}
                      <span className="sr-only"> left to look at</span>
                    </span>
                  )}
                </a>
              ))}
            </nav>
            <div className="al-bar-end">
              {name && (
                <a className="al-me" href={`${APP}/profile`} aria-label="My answers">
                  <Tile id={name} name={name} />
                </a>
              )}
            </div>
          </>
        )}
      </div>
      {me.loading ? (
        <p role="status">Loading the alumni app…</p>
      ) : me.error || !me.data ? (
        <LoadError message={me.error ?? "We couldn’t load the alumni app."} retry={me.reload} />
      ) : view === "not-found" ? (
        <>
          <h1 className="al-h1">Nothing here</h1>
          <p>
            There is nothing at this address. <a href={APP}>Go to the home page</a>
          </p>
        </>
      ) : ADMIN_VIEWS.includes(view) && !admin ? (
        <>
          <h1 className="al-h1">Admins only</h1>
          <p className="al-note" role="status">
            Only a Slice admin can open this page.
          </p>
        </>
      ) : view === "manage" ? (
        <ManageView />
      ) : view === "review" ? (
        <ReviewView />
      ) : view === "add" ? (
        <AddAlumniView />
      ) : view === "confirm" ? (
        <ConfirmView />
      ) : view === "reply" ? (
        <ReplyFormView id={path[1] ?? ""} />
      ) : view === "explore" ? (
        <ExplorerView admin={admin} mine={mine.data} />
      ) : view === "alum" ? (
        <AlumView id={path[1] ?? ""} admin={admin} mine={mine.data} onMine={mine.replace} />
      ) : firstUse && !name ? (
        <>
          <h1 className="al-h1">Add your name first</h1>
          <p className="al-note" role="status">
            Add your name on <a href="/account">your account page</a> first. The alumni app uses it
            for your answers.
          </p>
        </>
      ) : firstUse ? (
        // A new student answers three short steps first, then lands on their matches.
        <AnswersView
          profile={me.data.profile}
          firstUse
          onSaved={() => window.location.assign(`${APP}/matches`)}
        />
      ) : view === "profile" ? (
        <AnswersView
          profile={me.data.profile}
          firstUse={false}
          onSaved={(profile) => me.replace({ name, admin, profile })}
        />
      ) : mine.loading ? (
        <p role="status">Loading your matches…</p>
      ) : mine.error || !mine.data ? (
        <LoadError message={mine.error ?? "We couldn’t load your matches."} retry={mine.reload} />
      ) : view === "matches" ? (
        <MatchesView name={name} mine={mine.data} onMine={mine.replace} />
      ) : (
        <HomeView name={name} mine={mine.data} />
      )}
      <p className="al-foot">
        <strong>Work in progress</strong> · This app is still being built and will change.
      </p>
    </section>
  );
}
