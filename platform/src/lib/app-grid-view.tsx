// The launcher's tiles for one person: only the apps they can open or run.
import { AppCard } from "@slice/ui";
import type { AppView } from "../membership/contracts";
import { getAboutUrl, getAppUrl, type LauncherApp } from "./apps";

export type VisibleApp = {
  app: LauncherApp;
  isPrivate: boolean;
  /** Where Open goes when it is not the built-in route; null when the app cannot be opened. */
  href?: string | null;
  /** Shown in place of Open when the app cannot be opened, e.g. "Offline". */
  unavailable?: string;
};

/** Catalog apps this person can open or run, in catalog order. Anything unmentioned is hidden. */
export function visibleApps(catalog: readonly LauncherApp[], told: readonly AppView[]) {
  const shown: VisibleApp[] = [];
  for (const app of catalog) {
    const view = told.find((item) => item.id === app.id);
    if (view && (view.canOpen || view.canManage))
      shown.push({ app, isPrivate: view.visibility === "private" });
  }
  return shown;
}

export type AppGridState =
  | { kind: "loading" }
  | { kind: "error" }
  /** Signed in, but no member profile yet. */
  | { kind: "join" }
  | {
      kind: "ready";
      apps: VisibleApp[];
      /** Apps members made that this person can open or runs (docs/member-apps.md). */
      made?: VisibleApp[];
      /** For an owner: member apps whose managers asked to make them Public. */
      waiting?: { id: string; name: string; by: string }[];
      /** Whether members can make their own apps: true while member apps are switched on. */
      canMake?: boolean;
    };

/** Where a member starts making an app of their own: the Build page. */
export const MAKE_AN_APP_URL = "/build";

/** The way in to making an app, shown under the apps a person already has. */
function MakeAnAppLine() {
  return (
    <p className="grid-note">
      Need something that is not here? <a href={MAKE_AN_APP_URL}>Make an app with your AI</a>.
    </p>
  );
}

function Tiles({ apps }: { apps: VisibleApp[] }) {
  return (
    <div className="app-grid">
      {apps.map(({ app, isPrivate, href, unavailable }) => (
        <AppCard
          key={app.id}
          name={app.name}
          description={app.description}
          icon={app.icon}
          href={href === undefined ? getAppUrl(app) : href}
          detailsHref={getAboutUrl(app)}
          workInProgress={app.workInProgress}
          isPrivate={isPrivate}
          unavailableLabel={unavailable}
        />
      ))}
    </div>
  );
}

export function AppGridView({ state }: { state: AppGridState }) {
  if (state.kind === "loading") return <div className="app-grid" aria-busy="true" />;
  if (state.kind === "error")
    return (
      <div className="empty-catalog" role="alert">
        <h2>Your apps could not be loaded.</h2>
        <p>Refresh the page to try again.</p>
      </div>
    );
  if (state.kind === "join")
    return (
      <div className="empty-catalog">
        <h2>Finish setting up your account to see your apps.</h2>
        <p>
          <a href="/account">Go to your account</a>
        </p>
      </div>
    );
  const made = state.made ?? [];
  const waiting = state.waiting ?? [];
  if (state.apps.length === 0 && made.length === 0)
    return (
      <div className="empty-catalog">
        <h2>No apps have been shared with you yet.</h2>
        {state.canMake && <MakeAnAppLine />}
      </div>
    );
  return (
    <>
      {waiting.length > 0 && (
        <div className="notice" role="status">
          <p>Waiting for your OK to be Public:</p>
          <ul>
            {waiting.map((item) => (
              <li key={item.id}>
                <a href={getAboutUrl(item)}>{item.name}</a>, asked by {item.by}
              </li>
            ))}
          </ul>
        </div>
      )}
      {state.apps.length > 0 && <Tiles apps={state.apps} />}
      {made.length > 0 && (
        <section aria-labelledby="made-by-members">
          <h2 id="made-by-members" className="grid-heading">
            Made by members
          </h2>
          <Tiles apps={made} />
        </section>
      )}
      {state.canMake && <MakeAnAppLine />}
    </>
  );
}
