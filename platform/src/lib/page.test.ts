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

afterEach(() => {
  entries.length = 0;
});
it("shows a useful empty state before any apps are published", () => {
  const html = renderToStaticMarkup(createElement(Home));
  expect(html).toContain("Slice Consulting");
  expect(html).toContain("App Launcher");
  expect(html).toContain("No apps have been added yet");
});
it("renders the registered alumni starter and its platform link", () => {
  entries.push(...catalog);
  const html = renderToStaticMarkup(createElement(Home));
  expect(html).toContain("Alumni directory");
  expect(html).toContain('href="/apps/alumni"');
  expect(html).toContain('href="/guides/alumni"');
  expect(html).toMatch(/src="\/app-icons\/alumni\.svg\?v=[0-9a-f]{12}"/);
  expect(html).not.toContain("No apps have been added yet");
});
