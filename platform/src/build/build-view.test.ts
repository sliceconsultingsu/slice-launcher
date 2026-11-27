import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppView, View } from "../membership/contracts";
import { Launcher } from "../lib/home-views";
import { BuildContent, SectionNav, type BuildLoad } from "./build-view";

const manage = {
  powers: [],
  liveVersion: null as number | null,
  preview: null as number | null,
  latest: 0,
  publicApproved: false,
  publicRequestedBy: null as string | null,
  brief: null as { audience: "me" | "team" | "everyone"; saves: boolean } | null,
};
const app = (id: string, name: string, managing: Partial<typeof manage> = {}): AppView => ({
  id,
  canOpen: true,
  canManage: true,
  visibility: "private",
  managers: ["Ana Example"],
  settings: { id, visibility: "private", managers: ["ana"], people: [] },
  member: {
    name,
    description: `What ${name} is for.`,
    live: (managing.liveVersion ?? null) !== null,
    manage: { ...manage, ...managing },
  },
});
const view = (apps: AppView[], overrides: Partial<View> = {}): View => ({
  revision: 3,
  organization: "Slice Consulting",
  me: {
    id: "ana",
    email: "ana@example.test",
    name: "Ana Example",
    title: "",
    status: "active",
    levelId: "member",
    allow: [],
    deny: [],
    owner: false,
    joinedAt: "2026-11-18",
    signedIn: true,
  },
  permissions: [],
  members: [],
  levels: [],
  catalog: [],
  apps,
  appHost: "slice.example",
  making: { used: apps.length, most: 5, saves: false },
  ...overrides,
});
const page = (load: BuildLoad, props: Partial<Parameters<typeof BuildContent>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(BuildContent, { load, save: () => {}, reload: () => {}, ...props }),
  );
const shown = (apps: AppView[], overrides: Partial<View> = {}, props = {}) =>
  page({ kind: "loaded", view: view(apps, overrides) }, props);

describe("the Build page for someone who can make apps", () => {
  it("says how making an app goes, in three steps, and offers the form", () => {
    const html = shown([]);
    expect(html).toContain("<h1>Build</h1>");
    for (const step of ["Start it here.", "Hand it to your AI.", "Try it, then make it live."])
      expect(html).toContain(step);
    expect(html).toContain("What should it help with?");
    expect(html).toContain("your-app.slice.example");
    expect(html).toContain("Create draft");
    expect(html).toContain("0 of 5 apps used");
    expect(html).toContain("You have not started an app yet.");
  });

  it("shows each app at its stage with the next thing to do", () => {
    const html = shown([
      app("kickoff", "Kickoff checklist", { brief: { audience: "team", saves: false } }),
      app("rates", "Rate calculator", { latest: 3, preview: 3, liveVersion: 2 }),
      app("notes", "Notes", { latest: 2, liveVersion: 2 }),
      app("old", "Old tool", { latest: 1 }),
    ]);
    // A draft: its brief, ready to copy.
    expect(html).toContain("Waiting for your AI to publish a first preview.");
    expect(html).toContain("Copy the brief for Kickoff checklist");
    expect(html).toContain("App ID: kickoff");
    expect(html).toContain("Who it is for: my project team");
    // A preview: open it, or make it live.
    expect(html).toContain('href="https://rates.slice.example"');
    expect(html).toContain("Open preview");
    expect(html).toContain("Make it live");
    // A live app: open it, and share it from its own page.
    expect(html).toContain('<a class="secondary-button" href="/about/notes">Share');
    expect(html).toContain("Version 2 is live, and private to the people who run it.");
    // An offline app: its page has the way to put it back.
    expect(html).toContain('<a class="secondary-button" href="/about/old">Details');
    for (const label of ["Draft", "Preview", "Live", "Offline"])
      expect(html).toContain(`>${label}</span>`);
    expect(html.match(/Make it live/g)).toHaveLength(1);
    expect(html.match(/Copy the brief for/g)).toHaveLength(1);
  });

  it("opens the brief of the app just created, and keeps the others closed", () => {
    const apps = [app("first", "First"), app("second", "Second")];
    const html = shown(apps, {}, { fresh: "second" });
    expect(html.match(/<details class="build-brief" open="">/g)).toHaveLength(1);
    expect(html.match(/<details class="build-brief">/g)).toHaveLength(1);
  });

  it("takes the form away at the limit and says what to do", () => {
    const html = shown([], { making: { used: 5, most: 5, saves: false } });
    expect(html).toContain("5 of 5 apps used");
    expect(html).toContain("the most one member can have");
    expect(html).not.toContain("Create draft");
    // An owner has no limit.
    const owner = shown([], { making: { used: 7, most: null, saves: false } });
    expect(owner).toContain("7 apps made");
    expect(owner).toContain("Create draft");
    expect(shown([], { making: { used: 1, most: null, saves: false } })).toContain("1 app made");
  });

  it("says when their AI is not connected, and nothing when that is unknown", () => {
    expect(shown([], {}, { connected: false })).toContain(
      '<a href="/connect-ai">Connect your AI</a>',
    );
    expect(shown([], {}, { connected: true })).not.toContain("not connected to Slice yet");
    expect(shown([], {}, { connected: null })).not.toContain("not connected to Slice yet");
  });

  it("shows what was saved, and what went wrong, where a screen reader hears it", () => {
    const html = shown([], {}, { notice: "Draft created.", error: "That ID is already in use." });
    expect(html).toContain('<p class="notice" role="status">Draft created.</p>');
    expect(html).toContain('role="alert">That ID is already in use.</p>');
  });
});

describe("the Build page for everyone else", () => {
  it("offers sign-in to a visitor", () => {
    expect(page({ kind: "signed-out" })).toContain("Sign in with Google");
  });

  it("sends someone with no profile, or not yet approved, to their account", () => {
    for (const load of [
      { kind: "loaded", view: { needsEnrollment: true } },
      { kind: "loaded", view: view([], { me: { ...view([]).me, status: "pending" } }) },
    ] satisfies BuildLoad[]) {
      const html = page(load);
      expect(html).toContain("not active yet");
      expect(html).toContain('href="/account"');
      expect(html).not.toContain("Create draft");
    }
  });

  it("says making apps is switched off while it is", () => {
    const html = shown([], { appHost: null, making: undefined });
    expect(html).toContain("Making apps is switched off for now.");
    expect(html).not.toContain("Create draft");
  });

  it("reports a page that could not be loaded, with a way to try again", () => {
    const html = page({ kind: "failed", message: "This page could not be loaded." });
    expect(html).toContain("This page could not be loaded.");
    expect(html).toContain("Try again");
    expect(page({ kind: "loading" })).toContain('aria-busy="true"');
  });
});

describe("moving between a person's apps and making one", () => {
  it("marks the section the person is in", () => {
    const html = renderToStaticMarkup(createElement(SectionNav, { current: "build" }));
    expect(html).toContain('<a href="/">Applications</a>');
    expect(html).toContain('<a href="/build" aria-current="page">Build</a>');
  });

  it("is on the launcher's front page", () => {
    const html = renderToStaticMarkup(createElement(Launcher));
    expect(html).toContain('<a href="/" aria-current="page">Applications</a>');
    expect(html).toContain('<a href="/build">Build</a>');
  });
});
