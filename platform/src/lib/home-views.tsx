// The views behind the home page: the launcher for signed-in people, the front page for
// everyone else, and a placeholder while that is being checked.
import { AccountNav } from "../membership/account-nav";
import { SignInCard } from "../membership/sign-in-card";
import { ConnectionStatus } from "../ai-connections/connection-status";
import { SectionNav } from "../build/build-view";
import { AppGrid } from "./app-grid";
import { apps } from "./apps";

function GridIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function Logo() {
  return (
    <a className="brand" href="/" aria-label="Slice Consulting home">
      <img
        src="/brand/slice-logo.png"
        alt="Slice Consulting — Syracuse University"
        width="180"
        height="100"
      />
    </a>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <span>Slice Consulting</span>
      <nav className="project-links" aria-label="Project resources">
        <a href="/connect-ai">Connect your AI</a>
        <a
          href="https://github.com/sliceconsultingsu/slice-launcher/blob/main/docs/building-an-app.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          Making an app<span className="sr-only"> (opens in a new tab)</span>
        </a>
        <a
          href="https://github.com/sliceconsultingsu/slice-launcher"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </nav>
    </footer>
  );
}

/** Shown for the moment it takes to learn whether someone is signed in. */
export function Checking() {
  return (
    <>
      <header className="site-header">
        <Logo />
      </header>
      <main id="main" className="workspace-main" aria-busy="true" />
    </>
  );
}

/** What signed-out visitors see: the Slice name and Google sign-in, nothing else. */
export function FrontPage() {
  return (
    <>
      <header className="site-header">
        <Logo />
      </header>
      <main id="main" className="workspace-main">
        <section className="front-page" aria-labelledby="front-page-title">
          <h1 id="front-page-title">Slice Consulting</h1>
          <SignInCard error={null} />
        </section>
      </main>
    </>
  );
}

export function Launcher() {
  return (
    <>
      <header className="site-header">
        <Logo />
        <div className="header-divider" aria-hidden="true" />
        <span className="workspace-label">App Launcher</span>
        <ConnectionStatus />
        <AccountNav />
      </header>
      <main id="main" className="workspace-main">
        <SectionNav current="applications" />
        <section aria-labelledby="applications-title">
          <h1 id="applications-title">Applications</h1>
          {apps.length === 0 ? (
            <div className="empty-catalog">
              <span className="empty-icon">
                <GridIcon />
              </span>
              <h2>No apps have been added yet</h2>
            </div>
          ) : (
            <AppGrid />
          )}
        </section>
      </main>
    </>
  );
}
