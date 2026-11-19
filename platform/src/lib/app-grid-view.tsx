// The launcher's tiles for one person: only the apps they can open or run.
import { AppCard } from "@slice/ui";
import type { AppView } from "../membership/contracts";
import { getAboutUrl, getAppUrl, type LauncherApp } from "./apps";

export type VisibleApp = { app: LauncherApp; isPrivate: boolean };

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
  | { kind: "ready"; apps: VisibleApp[] };

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
  if (state.apps.length === 0)
    return (
      <div className="empty-catalog">
        <h2>No apps have been shared with you yet.</h2>
      </div>
    );
  return (
    <div className="app-grid">
      {state.apps.map(({ app, isPrivate }) => (
        <AppCard
          key={app.id}
          name={app.name}
          description={app.description}
          icon={app.icon}
          href={getAppUrl(app)}
          detailsHref={getAboutUrl(app)}
          workInProgress={app.workInProgress}
          isPrivate={isPrivate}
        />
      ))}
    </div>
  );
}
