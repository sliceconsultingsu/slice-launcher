import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import { AppIcon } from "@slice/ui";
import { AccountNav } from "../../../src/membership/account-nav";
import { ConnectionStatus } from "../../../src/ai-connections/connection-status";
import { AboutView } from "../../../src/lib/about-view";
import { apps } from "../../../src/lib/apps";
import { findGuide } from "../../../src/lib/guides";
import { MemberAboutView } from "../../../src/lib/member-about-view";
import { MEMBER_APP_ICON } from "../../../src/lib/member-app-model";
import { validAppId } from "../../../src/member-apps/rules";

// One page per app: its guide for everyone who can open it, and its settings for the people who
// run it. The page shell is public catalog information, like app.json; what it shows a person
// follows their membership, which the browser loads and the server checks on every request.
//
// An ID that is not a built-in app may be an app a member made (docs/member-apps.md). The shell
// for those says nothing about the app, not even whether it exists: its name, guide and settings
// come only from what the signed-in person is allowed to see.
export function generateStaticParams() {
  return apps.map((app) => ({ appId: app.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ appId: string }>;
}): Promise<Metadata> {
  const { appId } = await params;
  const guide = findGuide(appId);
  if (guide) return { title: `${guide.app.name} | Slice Consulting` };
  return { title: validAppId(appId) ? "App | Slice Consulting" : "App not found" };
}

export default async function AboutPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  const guide = findGuide(appId);
  if (!guide && !validAppId(appId)) notFound();
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
        <span className="workspace-label guide-app-label">
          <AppIcon src={guide ? guide.app.icon : MEMBER_APP_ICON} size={20} />
          {guide ? guide.app.name : "App"}
        </span>
        <ConnectionStatus />
        <AccountNav />
      </header>
      <main id="main" className="workspace-main">
        {guide ? (
          // Raw HTML is never rendered; react-markdown also strips unsafe link protocols.
          <AboutView app={guide.app} guide={<Markdown skipHtml>{guide.markdown}</Markdown>} />
        ) : (
          <MemberAboutView appId={appId} />
        )}
      </main>
    </div>
  );
}
