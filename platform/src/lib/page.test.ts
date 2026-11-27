import { afterEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LauncherApp } from "./apps";
import catalog from "../platform/catalog.generated.json";
const { entries } = vi.hoisted(() => ({ entries: [] as LauncherApp[] }));
vi.mock("./apps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./apps")>()),
  apps: entries,
}));
import Home from "../../app/page";
import { Footer, FrontPage, Launcher } from "./home-views";

afterEach(() => {
  entries.length = 0;
});
it("renders only the shell until it knows whether someone is signed in", () => {
  entries.push(...catalog);
  const html = renderToStaticMarkup(createElement(Home));
  expect(html).toContain('aria-busy="true"');
  expect(html).not.toContain("Alumni directory");
  expect(html).not.toContain("Sign in with Google");
});
it("front page shows the Slice name and Google sign-in only", () => {
  const html = renderToStaticMarkup(createElement(FrontPage));
  expect(html).toContain("<h1");
  expect(html).toContain("Slice Consulting");
  expect(html).toContain('href="/api/auth/google/start"');
  expect(html).not.toContain("App Launcher");
});
it("shows a useful empty state before any apps are published", () => {
  const html = renderToStaticMarkup(createElement(Launcher));
  expect(html).toContain("Slice Consulting");
  expect(html).toContain("App Launcher");
  expect(html).toContain("No apps have been added yet");
});
it("shows no tiles until it knows which apps this person can open", () => {
  entries.push(...catalog);
  const html = renderToStaticMarkup(createElement(Launcher));
  expect(html).toContain("Applications");
  expect(html).toContain('aria-busy="true"');
  expect(html).not.toContain("Alumni directory");
  expect(html).not.toContain('href="/apps/alumni"');
  expect(html).not.toContain("No apps have been added yet");
});
it("points people from the footer to making an app, not to adding one to the launcher's code", () => {
  const html = renderToStaticMarkup(createElement(Footer));
  expect(html).toContain('href="/connect-ai"');
  expect(html).toContain(
    'href="https://github.com/sliceconsultingsu/slice-launcher/blob/main/docs/building-an-app.md"',
  );
  expect(html).toContain("Making an app");
  expect(html).not.toContain("adding-an-app");
  expect(html).not.toContain("Contributor guide");
});
