import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import { AppIcon } from "@slice/ui";
import { AccountNav } from "../../../src/membership/account-nav";
import { ConnectionStatus } from "../../../src/ai-connections/connection-status";
import { AboutView } from "../../../src/lib/about-view";
import { apps } from "../../../src/lib/apps";
import { findGuide } from "../../../src/lib/guides";

// One page per app: its guide for everyone who can open it, and its settings for the people who
// run it. The page shell is public catalog information, like app.json; what it shows a person
// follows their membership, which the browser loads and the server checks on every request.
export function generateStaticParams() {
  return apps.map((app) => ({ appId: app.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ appId: string }>;
}): Promise<Metadata> {
  const guide = findGuide((await params).appId);
  return { title: guide ? `${guide.app.name} | Slice Consulting` : "App not found" };
}

export default async function AboutPage({ params }: { params: Promise<{ appId: string }> }) {
  const guide = findGuide((await params).appId);
  if (!guide) notFound();
  const { app, markdown } = guide;
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
          <AppIcon src={app.icon} size={20} />
          {app.name}
        </span>
        <ConnectionStatus />
        <AccountNav />
      </header>
      <main id="main" className="workspace-main">
        {/* Raw HTML is never rendered; react-markdown also strips unsafe link protocols. */}
        <AboutView app={app} guide={<Markdown skipHtml>{markdown}</Markdown>} />
      </main>
    </div>
  );
}
