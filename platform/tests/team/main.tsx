import { createRoot } from "react-dom/client";
import { DirectoryView } from "../../apps/alumni/ui/directory";
import "../../app/globals.css";

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
      <DirectoryView />
    </main>
  </div>,
);
