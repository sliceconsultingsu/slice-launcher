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
import { FrontPage, Launcher } from "./home-views";

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
it("renders the registered alumni starter and its platform link", () => {
  entries.push(...catalog);
  const html = renderToStaticMarkup(createElement(Launcher));
  expect(html).toContain("Alumni directory");
  expect(html).toContain('href="/apps/alumni"');
  expect(html).toContain('href="/guides/alumni"');
  expect(html).toMatch(/src="\/app-icons\/alumni\.svg\?v=[0-9a-f]{12}"/);
  expect(html).not.toContain("No apps have been added yet");
});
