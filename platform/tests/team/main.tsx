import { createRoot } from "react-dom/client";
import { AlumniApp } from "../../apps/alumni/ui/app";
import "../../app/globals.css";

// The part of the address after /apps/alumni decides which screen shows, as on the platform.
const path = window.location.pathname
  .replace(/^\/apps\/alumni/, "")
  .split("/")
  .filter(Boolean)
  .map(decodeURIComponent);

createRoot(document.getElementById("root")!).render(
  <div className="workspace-shell">
    <a className="skip-link" href="#main">
      Skip to content
    </a>
    <header className="site-header">
      <a href="/">Slice Consulting</a>
      <span>Team learning workspace</span>
    </header>
    <main id="main" className="workspace-main">
      <p className="notice">
        <strong>Learning preview</strong> · Every person and company here is fictional.
      </p>
      <AlumniApp path={path} />
    </main>
  </div>,
);
