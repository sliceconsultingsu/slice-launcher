import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("./apps", () => ({ apps: [], getAppUrl: (app: { id: string }) => `/apps/${app.id}` }));
import Home from "../../app/page";

it("shows a useful empty state before any apps are published", () => {
  const html = renderToStaticMarkup(createElement(Home));
  expect(html).toContain("Slice Consulting");
  expect(html).toContain("App Launcher");
  expect(html).toContain("No apps have been added yet");
});
