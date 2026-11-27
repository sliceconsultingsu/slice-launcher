"use client";
// The Build page (docs/member-apps.md): where a member starts an app, hands it to their own AI,
// and brings it live. Slice has no AI of its own, so the building happens in the member's AI
// app; this page is where it starts, where its progress shows, and where it is made live.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { loadConnections } from "../ai-connections/connected-apps";
import { CopyField } from "../connect-ai/copy-field";
import { getAboutUrl } from "../lib/apps";
import { appIdProblem } from "../member-apps/rules";
import type { AppBrief, Command, View } from "../membership/contracts";
import {
  loadView,
  MembershipRequestError,
  saveCommand,
  type NeedsProfile,
} from "../membership/membership-client";
import { SignInCard } from "../membership/sign-in-card";
import {
  AUDIENCE_LABEL,
  briefFor,
  myApps,
  NO_SAVING,
  STAGE_LABEL,
  suggestId,
  type BuildApp,
} from "./model";

export type BuildLoad =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "failed"; message: string }
  | { kind: "loaded"; view: View | NeedsProfile };

/** The sections of the launcher a member moves between: their apps, and making one. */
export function SectionNav({ current }: { current: "applications" | "build" }) {
  const link = (id: typeof current, href: string, label: string) => (
    <a href={href} aria-current={current === id ? "page" : undefined}>
      {label}
    </a>
  );
  return (
    <nav className="account-tabs" aria-label="Sections">
      {link("applications", "/", "Applications")}
      {link("build", "/build", "Build")}
    </nav>
  );
}

type Draft = {
  purpose: string;
  name: string;
  id: string;
  audience: AppBrief["audience"];
  saves: boolean;
};
const EMPTY: Draft = { purpose: "", name: "", id: "", audience: "team", saves: false };

/** The form that starts an app: what it is for, its name and address, and who it is for. */
function StartForm({
  appHost,
  saves,
  busy,
  create,
}: {
  appHost: string;
  saves: boolean;
  busy: boolean;
  create: (command: Command) => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  // The address follows the name until the person types an address of their own.
  const [ownAddress, setOwnAddress] = useState(false);
  const [problem, setProblem] = useState("");
  const edit = (change: Partial<Draft>) => {
    setProblem("");
    setDraft((before) => {
      const next = { ...before, ...change };
      return ownAddress || change.name === undefined ? next : { ...next, id: suggestId(next.name) };
    });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const purpose = draft.purpose.trim();
    const name = draft.name.trim();
    if (!purpose) return setProblem("Say what the app should help with.");
    if (!name) return setProblem("Give the app a name.");
    const invalid = appIdProblem(draft.id, []);
    if (invalid) return setProblem(invalid.replace("An app's ID", "An address"));
    create({
      type: "memberapp.create",
      id: draft.id,
      name,
      description: purpose,
      brief: { audience: draft.audience, saves: draft.saves },
    });
  };
  return (
    <form className="form-stack build-form" onSubmit={submit} noValidate>
      <label>
        What should it help with?
        <textarea
          rows={2}
          maxLength={200}
          value={draft.purpose}
          onChange={(event) => edit({ purpose: event.target.value })}
          placeholder="A checklist for kicking off a new client project"
        />
        <span className="field-note">One or two sentences. Your AI will ask you for the rest.</span>
      </label>
      <div className="build-pair">
        <label>
          Name
          <input
            type="text"
            maxLength={80}
            value={draft.name}
            onChange={(event) => edit({ name: event.target.value })}
            placeholder="Kickoff checklist"
          />
        </label>
        <label>
          Address
          <input
            type="text"
            maxLength={32}
            value={draft.id}
            onChange={(event) => {
              setOwnAddress(true);
              edit({ id: event.target.value.toLowerCase() });
            }}
            placeholder="kickoff-checklist"
            autoCapitalize="none"
            spellCheck={false}
          />
          <span className="field-note">
            {draft.id || "your-app"}.{appHost}. It cannot be changed later.
          </span>
        </label>
      </div>
      <label>
        Who is it for?
        <select
          value={draft.audience}
          onChange={(event) => edit({ audience: event.target.value as AppBrief["audience"] })}
        >
          {(Object.keys(AUDIENCE_LABEL) as AppBrief["audience"][]).map((audience) => (
            <option key={audience} value={audience}>
              {AUDIENCE_LABEL[audience]}
            </option>
          ))}
        </select>
        <span className="field-note">
          A new app is private to you. You share it once it is live; showing it to every member
          needs the Slice owner&apos;s OK.
        </span>
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={draft.saves}
          onChange={(event) => edit({ saves: event.target.checked })}
        />
        <span>
          It needs to remember what people enter, or show people each other&apos;s entries
        </span>
      </label>
      {draft.saves && !saves && <p className="notice">{NO_SAVING}</p>}
      {problem && (
        <p className="notice error-notice" role="alert">
          {problem}
        </p>
      )}
      <button className="primary-button" type="submit" disabled={busy}>
        Create draft
      </button>
    </form>
  );
}

/** The profile's status badges: a preview is waiting on its maker, a live app is active. */
const STAGE_BADGE: Record<BuildApp["stage"], string> = {
  draft: "",
  preview: "status-pending",
  live: "status-active",
  offline: "",
};

/** One of a person's apps: where it stands and the next thing to do with it. */
function AppRow({
  app,
  saves,
  fresh,
  busy,
  save,
}: {
  app: BuildApp;
  saves: boolean;
  fresh: boolean;
  busy: boolean;
  save: (command: Command) => void;
}) {
  return (
    <li className="build-app" data-stage={app.stage}>
      <div className="build-app-head">
        <div>
          <h3>{app.name}</h3>
          <p>{app.line}</p>
        </div>
        <span className={`status-badge ${STAGE_BADGE[app.stage]}`}>{STAGE_LABEL[app.stage]}</span>
      </div>
      <div className="build-app-actions">
        {app.stage === "preview" && app.address && (
          <a className="secondary-button" href={app.address}>
            Open preview<span className="sr-only"> of {app.name}</span>
          </a>
        )}
        {app.stage === "preview" && app.preview !== null && (
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => save({ type: "memberapp.live", id: app.id, version: app.preview })}
          >
            Make it live<span className="sr-only">: {app.name}</span>
          </button>
        )}
        {app.stage === "live" && app.address && (
          <a className="secondary-button" href={app.address}>
            Open<span className="sr-only"> {app.name}</span>
          </a>
        )}
        <a className="secondary-button" href={getAboutUrl(app)}>
          {app.stage === "live" ? "Share" : "Details"}
          <span className="sr-only">
            {app.stage === "live" ? "" : " for"} {app.name}
          </span>
        </a>
      </div>
      {app.stage === "draft" && (
        <details className="build-brief" open={fresh}>
          <summary>The brief for your AI</summary>
          <CopyField
            id={`brief-${app.id}`}
            label="Paste this into your AI app"
            value={briefFor(app, { saves })}
            buttonLabel={`Copy the brief for ${app.name}`}
            multiline
          />
        </details>
      )}
    </li>
  );
}

export function BuildContent({
  load,
  connected = null,
  save,
  reload,
  busy = false,
  notice = "",
  error = "",
  fresh = null,
}: {
  load: BuildLoad;
  /** Whether this person has an AI app connected; null while unknown or when it cannot be told. */
  connected?: boolean | null;
  save: (command: Command) => void;
  reload: () => void;
  busy?: boolean;
  notice?: string;
  error?: string;
  /** The app created a moment ago, whose brief is shown open. */
  fresh?: string | null;
}) {
  if (load.kind === "loading") return <div aria-busy="true" />;
  if (load.kind === "signed-out") return <SignInCard error={null} />;
  if (load.kind === "failed")
    return (
      <section className="account-card">
        <h1>Build</h1>
        <p className="notice error-notice" role="alert">
          {load.message}
        </p>
        <button className="secondary-button" type="button" onClick={reload}>
          Try again
        </button>
      </section>
    );
  const { view } = load;
  if ("needsEnrollment" in view || view.me.status !== "active")
    return (
      <section className="account-card">
        <h1>Build</h1>
        <p>Your Slice membership is not active yet, so you cannot make apps.</p>
        <a className="primary-button" href="/account">
          Go to your account
        </a>
      </section>
    );
  if (!view.appHost || !view.making)
    return (
      <section className="account-card">
        <h1>Build</h1>
        <p>Making apps is switched off for now. Ask the Slice owner when it will be back.</p>
      </section>
    );
  const { making } = view;
  const apps = myApps(view);
  const full = making.most !== null && making.used >= making.most;
  const start = (
    <section className="account-card" aria-labelledby="build-start">
      <h2 id="build-start">Start a new app</h2>
      <p className="field-note">
        {making.most === null
          ? `${making.used} ${making.used === 1 ? "app" : "apps"} made`
          : `${making.used} of ${making.most} apps used`}
      </p>
      {full ? (
        <p className="notice">
          You have {making.most} apps, the most one member can have. Delete one from its page first,
          or ask the Slice owner.
        </p>
      ) : (
        <StartForm
          // A new revision means a draft was created: start the form again, empty.
          key={view.revision}
          appHost={view.appHost}
          saves={making.saves}
          busy={busy}
          create={save}
        />
      )}
    </section>
  );
  const yours = (
    <section className="account-card" aria-labelledby="build-yours">
      <div className="section-toolbar">
        <h2 id="build-yours">Your apps</h2>
        <button className="secondary-button" type="button" disabled={busy} onClick={reload}>
          Check again
        </button>
      </div>
      {apps.length === 0 ? (
        <p>You have not started an app yet.</p>
      ) : (
        <ul className="build-list">
          {apps.map((app) => (
            <AppRow
              key={app.id}
              app={app}
              saves={making.saves}
              fresh={fresh === app.id}
              busy={busy}
              save={save}
            />
          ))}
        </ul>
      )}
    </section>
  );
  return (
    <>
      <h1>Build</h1>
      <p className="build-intro">
        Make a small app for yourself or your team. You say what you need here, your own AI builds
        it, and you bring it live here.
      </p>
      <ol className="build-steps">
        <li>
          <strong>Start it here.</strong> Describe it and give it a name.
        </li>
        <li>
          <strong>Hand it to your AI.</strong> Copy the brief into Claude or ChatGPT.
        </li>
        <li>
          <strong>Try it, then make it live.</strong> Your AI publishes a preview only you can see.
        </li>
      </ol>
      {connected === false && (
        <p className="notice">
          Your AI is not connected to Slice yet, so it cannot build here.{" "}
          <a href="/connect-ai">Connect your AI</a> first. You can still start a draft now.
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="notice error-notice" role="alert">
          {error}
        </p>
      )}
      {/* Someone with apps under way came back for those; someone with none came to start one. */}
      {apps.length > 0 ? (
        <>
          {yours}
          {start}
        </>
      ) : (
        <>
          {start}
          {yours}
        </>
      )}
    </>
  );
}

/** Loads the signed-in person's membership view and shows the Build page. */
export function BuildView() {
  const [load, setLoad] = useState<BuildLoad>({ kind: "loading" });
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
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
    let active = true;
    void loadConnections((input, init) => fetch(input, init)).then((response) => {
      // Told only when AI connections are switched on; otherwise the page says nothing of it.
      if (active && response?.enabled) setConnected(response.connections.length > 0);
    });
    return () => {
      active = false;
    };
  }, [reload]);
  const save = async (command: Command) => {
    if (load.kind !== "loaded" || !("me" in load.view)) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      setLoad({ kind: "loaded", view: await saveCommand(load.view.revision, command) });
      if (command.type === "memberapp.create") {
        setFresh(command.id);
        setNotice("Draft created. Copy its brief into your AI app to start building.");
      } else setNotice("It is live. Share it from its page when you are ready.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save changes.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <BuildContent
      load={load}
      connected={connected}
      save={(command) => void save(command)}
      reload={() => void reload()}
      busy={busy}
      notice={notice}
      error={error}
      fresh={fresh}
    />
  );
}
