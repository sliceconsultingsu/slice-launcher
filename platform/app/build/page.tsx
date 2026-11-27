import type { Metadata } from "next";
import { ConnectionStatus } from "../../src/ai-connections/connection-status";
import { BuildView, SectionNav } from "../../src/build/build-view";
import { Footer } from "../../src/lib/home-views";
import { AccountNav } from "../../src/membership/account-nav";

export const metadata: Metadata = { title: "Build | Slice Consulting" };

// Where a member starts an app and brings it live (docs/member-apps.md). The shell says nothing
// about anyone; what the page shows follows the signed-in person's membership, which the
// browser loads and the server checks on every request.
export default function BuildPage() {
  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Slice Consulting home">
          <img
            src="/brand/slice-logo.png"
            alt="Slice Consulting — Syracuse University"
            width="180"
            height="100"
          />
        </a>
        <div className="header-divider" aria-hidden="true" />
        <span className="workspace-label">App Launcher</span>
        <ConnectionStatus />
        <AccountNav />
      </header>
      <main id="main" className="workspace-main build-page">
        <SectionNav current="build" />
        <BuildView />
      </main>
      <Footer />
    </div>
  );
}
