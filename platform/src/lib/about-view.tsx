"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { PrivateBadge, WorkInProgressBadge } from "@slice/ui";
import type { Command, View } from "../membership/contracts";
import {
  loadView,
  MembershipRequestError,
  saveCommand,
  type NeedsProfile,
} from "../membership/membership-client";
import { SignInCard } from "../membership/sign-in-card";
import { AppManage } from "./app-manage";
import { aboutState } from "./app-manage-model";
import { getAppUrl, type LauncherApp } from "./apps";

export type AboutLoad =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "failed"; message: string }
  | { kind: "loaded"; view: View | NeedsProfile };

const names = (list: string[]) =>
  new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(list);

/**
 * One app's page: its guide for everyone who can open it and, for the people who run it, its
 * settings. What is shown follows the membership view; the server enforces access on its own.
 */
export function AboutContent({
  app,
  guide,
  load,
  save,
  reload,
  busy = false,
  notice = "",
  error = "",
}: {
  app: LauncherApp;
  guide: ReactNode;
  load: AboutLoad;
  save: (command: Command) => void;
  reload: () => void;
  busy?: boolean;
  notice?: string;
  error?: string;
}) {
  const state = load.kind === "loaded" ? aboutState(load.view, app.id) : null;
  const open = state?.kind === "open" ? state.app : null;
  const view = load.kind === "loaded" && "me" in load.view ? load.view : null;
  return (
    <>
      <nav className="guide-actions" aria-label="App page actions">
        <a className="guide-back" href="/">
          <span aria-hidden="true">←</span> Applications
        </a>
        {open?.visibility === "private" && <PrivateBadge />}
        {open && app.workInProgress && <WorkInProgressBadge />}
        {open?.canOpen && (
          <a className="guide-open" href={getAppUrl(app)}>
            Open<span className="sr-only"> {app.name}</span>
          </a>
        )}
      </nav>
      {load.kind === "loading" && <div aria-busy="true" />}
      {load.kind === "signed-out" && <SignInCard error={null} />}
      {load.kind === "failed" && (
        <section className="account-card">
          <h1>{app.name}</h1>
          <p className="notice error-notice" role="alert">
            {load.message}
          </p>
          <button className="secondary-button" type="button" onClick={reload}>
            Try again
          </button>
        </section>
      )}
      {state?.kind === "inactive" && (
        <section className="account-card">
          <h1>{app.name}</h1>
          <p>Your Slice membership is not active yet, so you cannot open apps.</p>
          <a className="primary-button" href="/account">
            Go to your account
          </a>
        </section>
      )}
      {state?.kind === "private" && (
        <section className="account-card">
          <h1>{app.name}</h1>
          <p>This app is private.</p>
          <p>Ask {state.managers.length ? names(state.managers) : "the Slice owner"} for access.</p>
        </section>
      )}
      {open && (
        <>
          <p className="about-summary">
            {open.visibility === "public" ? "Public" : "Private"}
            {" · "}
            Run by {open.managers.length ? names(open.managers) : "the Slice owner"}
          </p>
          <article className="guide-content">{guide}</article>
          {open.canManage && open.settings && view && (
            <section className="account-card about-manage" aria-labelledby="manage-title">
              <h2 id="manage-title">Manage this app</h2>
              {notice && (
                <p className="notice" role="status">
                  {notice}
                </p>
              )}
              {error && (
                <div className="notice error-notice" role="alert">
                  <p>{error}</p>
                  <button className="secondary-button" type="button" onClick={reload}>
                    Reload
                  </button>
                </div>
              )}
              <AppManage
                // A save or reload brings a new revision; start the form again from what is saved.
                key={view.revision}
                app={app}
                view={view}
                settings={open.settings}
                save={save}
                busy={busy}
              />
            </section>
          )}
        </>
      )}
    </>
  );
}

/** Loads the signed-in person's membership view and shows the app page for it. */
export function AboutView({ app, guide }: { app: LauncherApp; guide: ReactNode }) {
  const [load, setLoad] = useState<AboutLoad>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setNotice("");
    setError("");
    try {
      setLoad({ kind: "loaded", view: await loadView() });
    } catch (e) {
      setLoad(
        e instanceof MembershipRequestError && e.signedOut
          ? { kind: "signed-out" }
          : { kind: "failed", message: "This page could not be loaded." },
      );
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const save = async (command: Command) => {
    if (load.kind !== "loaded" || !("me" in load.view)) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      setLoad({ kind: "loaded", view: await saveCommand(load.view.revision, command) });
      setNotice("Changes saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save changes.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <AboutContent
      app={app}
      guide={guide}
      load={load}
      save={(command) => void save(command)}
      reload={() => void reload()}
      busy={busy}
      notice={notice}
      error={error}
    />
  );
}
