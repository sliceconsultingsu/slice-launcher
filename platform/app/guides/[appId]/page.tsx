import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import { AppIcon, WorkInProgressBadge } from "@slice/ui";
import { AccountNav } from "../../../src/membership/account-nav";
import { apps, getAppUrl } from "../../../src/lib/apps";
import { findGuide } from "../../../src/lib/guides";

// Guides are public catalog metadata, like app.json: every member can read one before access
// to the app itself is granted. They must never contain private data.
export function generateStaticParams() {
  return apps.map((app) => ({ appId: app.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ appId: string }>;
}): Promise<Metadata> {
  const guide = findGuide((await params).appId);
  return { title: guide ? `${guide.app.name} guide | Slice Consulting` : "Guide not found" };
}

export default async function GuidePage({ params }: { params: Promise<{ appId: string }> }) {
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
        <AccountNav />
      </header>
      <main id="main" className="workspace-main">
        <nav className="guide-actions" aria-label="Guide actions">
          <a className="guide-back" href="/">
            <span aria-hidden="true">←</span> Applications
          </a>
          {app.workInProgress && <WorkInProgressBadge />}
          <a className="guide-open" href={getAppUrl(app)}>
            Open<span className="sr-only"> {app.name}</span>
          </a>
        </nav>
        {/* Raw HTML is never rendered; react-markdown also strips unsafe link protocols. */}
        <article className="guide-content">
          <Markdown skipHtml>{markdown}</Markdown>
        </article>
      </main>
    </div>
  );
}
