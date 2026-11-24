"use client";
// The launcher's page for an app a member made (docs/member-apps.md): the same page every app
// has, plus, for the people who run it, its versions and the ways to take it offline or delete it.
import { useCallback, useEffect, useState } from "react";
import Markdown from "react-markdown";
import type { AppView, Command, View } from "../membership/contracts";
import {
  loadView,
  MembershipRequestError,
  saveCommand,
  type NeedsProfile,
} from "../membership/membership-client";
import { SignInCard } from "../membership/sign-in-card";
import { AboutContent } from "./about-view";
import { memberAppUrl, memberLauncherApp, publicRule } from "./member-app-model";

export type MemberAppInfo = {
  guide: string;
  versions?: { version: number; at: string; by: string }[];
};
export type MemberAboutLoad =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "failed"; message: string }
  /** `info` is null when the membership view does not mention the app. */
  | { kind: "loaded"; view: View | NeedsProfile; info: MemberAppInfo | null };

const day = (at: string) =>
  new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Versions, and the ways to take the app offline, put a version live, or delete it. */
function MemberAppPanel({
  told,
  info,
  address,
  save,
  busy,
}: {
  told: AppView;
  info: MemberAppInfo;
  address: string | null;
  save: (command: Command) => void;
  busy: boolean;
}) {
  const [deleting, setDeleting] = useState(false);
  const manage = told.member?.manage;
  if (!manage) return null;
  const live = (version: number | null) => save({ type: "memberapp.live", id: told.id, version });
  return (
    <div className="member-panel">
      <h3>Versions</h3>
      {manage.latest === 0 ? (
        <p>
          Nothing has been published yet. Ask your AI to publish it; it uses the{" "}
          <code>slice_app_publish</code> tool.
        </p>
      ) : (
        <>
          {manage.preview !== null && (
            <div className="notice">
              <p>
                Version {manage.preview} is a preview. Only the people who run this app see it
                {address && (
                  <>
                    {" at "}
                    <a href={address}>{address}</a>
                  </>
                )}
                ; everyone else sees{" "}
                {manage.liveVersion === null ? "nothing yet" : "the live version"}. Its server code,
                if it has any, works on the app&apos;s real data.
              </p>
              <button
                className="secondary-button"
                type="button"
                disabled={busy}
                onClick={() => save({ type: "memberapp.preview", id: told.id, version: null })}
              >
                Discard preview
              </button>
            </div>
          )}
          <p>
            {manage.liveVersion === null
              ? manage.preview === null
                ? "Offline. Nobody can open it."
                : "Nothing is live yet."
              : `Version ${manage.liveVersion} is live`}
            {manage.liveVersion !== null && address && (
              <>
                {" at "}
                <a href={address}>{address}</a>
              </>
            )}
            {manage.liveVersion !== null && "."}
          </p>
          <ul className="manage-list">
            {(info.versions ?? []).map((item) => (
              <li key={item.version}>
                <span>
                  Version {item.version} · {day(item.at)} · {item.by}
                  {item.version === manage.liveVersion && " · Live"}
                  {item.version === manage.preview && " · Preview"}
                </span>
                {item.version !== manage.liveVersion && (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busy}
                    onClick={() => live(item.version)}
                  >
                    Make version {item.version} live
                  </button>
                )}
              </li>
            ))}
          </ul>
          {manage.liveVersion !== null && (
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => live(null)}
            >
              Take offline
            </button>
          )}
        </>
      )}
      <h3>Delete</h3>
      {deleting ? (
        <div className="notice manage-confirm" role="alert">
          <p>
            Delete {told.member?.name}? It goes offline for everyone, and its ID can never be used
            again.
          </p>
          <div className="manage-actions">
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={() => save({ type: "memberapp.delete", id: told.id })}
            >
              Delete
            </button>
            <button className="secondary-button" type="button" onClick={() => setDeleting(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="secondary-button" type="button" onClick={() => setDeleting(true)}>
          Delete this app
        </button>
      )}
    </div>
  );
}

export function MemberAboutContent({
  appId,
  load,
  save,
  reload,
  busy = false,
  notice = "",
  error = "",
}: {
  appId: string;
  load: MemberAboutLoad;
  save: (command: Command) => void;
  reload: () => void;
  busy?: boolean;
  notice?: string;
  error?: string;
}) {
  const back = (
    <nav className="guide-actions" aria-label="App page actions">
      <a className="guide-back" href="/">
        <span aria-hidden="true">←</span> Applications
      </a>
    </nav>
  );
  if (load.kind === "loading") return <div aria-busy="true" />;
  if (load.kind === "signed-out")
    return (
      <>
        {back}
        <SignInCard error={null} />
      </>
    );
  if (load.kind === "failed")
    return (
      <>
        {back}
        <section className="account-card">
          <h1>App</h1>
          <p className="notice error-notice" role="alert">
            {load.message}
          </p>
          <button className="secondary-button" type="button" onClick={reload}>
            Try again
          </button>
        </section>
      </>
    );
  const { view, info } = load;
  if ("needsEnrollment" in view || view.me.status !== "active")
    return (
      <>
        {back}
        <section className="account-card">
          <h1>App</h1>
          <p>Your Slice membership is not active yet, so you cannot open apps.</p>
          <a className="primary-button" href="/account">
            Go to your account
          </a>
        </section>
      </>
    );
  const told = view.apps.find((item) => item.id === appId);
  const app = told ? memberLauncherApp(told) : null;
  // An app this person is not on is described exactly like one that does not exist.
  if (!told || !app || !info)
    return (
      <>
        {back}
        <section className="account-card">
          <h1>App</h1>
          <p>There is no app here that you can open.</p>
          <p>If someone sent you this link, ask them to add you to the app.</p>
        </section>
      </>
    );
  const offline = !told.member?.live;
  // The people who run the app can open its preview even while nothing is live.
  const openable = !offline || (told.member?.manage?.preview ?? null) !== null;
  const address = memberAppUrl(appId, view.appHost);
  return (
    <AboutContent
      app={app}
      load={{ kind: "loaded", view }}
      save={save}
      reload={reload}
      busy={busy}
      notice={notice}
      error={error}
      openHref={openable ? address : null}
      publicRule={publicRule(told, view.me.owner)}
      publicRequestedBy={told.member?.manage?.publicRequestedBy ?? null}
      guide={
        <>
          <h1>{app.name}</h1>
          {offline && !told.canManage ? (
            <p>This app is offline. Ask the people who run it when it will be back.</p>
          ) : (
            // Raw HTML is never rendered; react-markdown also strips unsafe link protocols.
            <Markdown skipHtml>{info.guide}</Markdown>
          )}
        </>
      }
    >
      <MemberAppPanel told={told} info={info} address={address} save={save} busy={busy} />
    </AboutContent>
  );
}

/** Loads the signed-in person's membership view and the app's guide, and shows the page. */
export function MemberAboutView({ appId }: { appId: string }) {
  const [load, setLoad] = useState<MemberAboutLoad>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const read = useCallback(
    async (view: View | NeedsProfile): Promise<MemberAboutLoad> => {
      if ("needsEnrollment" in view || !view.apps.some((item) => item.id === appId))
        return { kind: "loaded", view, info: null };
      const response = await fetch(`/api/member-apps/${appId}`, {
        cache: "no-store",
        redirect: "error",
      });
      return {
        kind: "loaded",
        view,
        info: response.ok ? ((await response.json()) as MemberAppInfo) : null,
      };
    },
    [appId],
  );
  const reload = useCallback(async () => {
    setNotice("");
    setError("");
    try {
      setLoad(await read(await loadView()));
    } catch (e) {
      setLoad(
        e instanceof MembershipRequestError && e.signedOut
          ? { kind: "signed-out" }
          : { kind: "failed", message: "This page could not be loaded." },
      );
    }
  }, [read]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const save = async (command: Command) => {
    if (load.kind !== "loaded" || !("me" in load.view)) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      setLoad(await read(await saveCommand(load.view.revision, command)));
      setNotice("Changes saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save changes.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <MemberAboutContent
      appId={appId}
      load={load}
      save={(command) => void save(command)}
      reload={() => void reload()}
      busy={busy}
      notice={notice}
      error={error}
    />
  );
}
