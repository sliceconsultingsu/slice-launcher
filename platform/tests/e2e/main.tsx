import { createRoot } from "react-dom/client";
import Markdown from "react-markdown";
import Home from "../../app/page";
import Account from "../../app/account/page";
import ConnectAi from "../../app/connect-ai/page";
import { AboutView } from "../../src/lib/about-view";
import { findGuide } from "../../src/lib/guides";
import { MemberAboutView } from "../../src/lib/member-about-view";
import "../../app/globals.css";

/** The app page as the real route renders it, without the server-only header parts. */
function About({ appId }: { appId: string }) {
  const guide = findGuide(appId);
  return (
    <div className="workspace-shell">
      <main id="main" className="workspace-main">
        {guide ? (
          <AboutView app={guide.app} guide={<Markdown skipHtml>{guide.markdown}</Markdown>} />
        ) : (
          <MemberAboutView appId={appId} />
        )}
      </main>
    </div>
  );
}
const about = /^\/about\/([a-z][a-z0-9-]{0,39})$/.exec(location.pathname);
createRoot(document.getElementById("root")!).render(
  about ? (
    <About appId={about[1]} />
  ) : location.pathname === "/account" ? (
    <Account />
  ) : location.pathname === "/connect-ai" ? (
    <ConnectAi />
  ) : (
    <Home />
  ),
);
