import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppView } from "../membership/contracts";
import { AppGridView, visibleApps } from "./app-grid-view";
import type { LauncherApp } from "./apps";

const app = (id: string): LauncherApp => ({
  id,
  name: `${id} app`,
  description: `About ${id}`,
  permissions: [],
  icon: `/app-icons/${id}.svg?v=0123456789ab`,
});
const told = (id: string, overrides: Partial<AppView> = {}): AppView => ({
  id,
  canOpen: false,
  canManage: false,
  visibility: "private",
  managers: [],
  ...overrides,
});
const catalog = [app("alumni"), app("notes"), app("ledger")];
const render = (state: Parameters<typeof AppGridView>[0]["state"]) =>
  renderToStaticMarkup(createElement(AppGridView, { state }));

describe("which tiles a person sees", () => {
  it("keeps the apps they can open or run, in catalog order, and hides the rest", () => {
    const shown = visibleApps(catalog, [
      told("ledger", { canOpen: true, visibility: "public" }),
      told("alumni", { canManage: true }),
      told("notes"),
    ]);
    expect(shown.map((entry) => entry.app.id)).toEqual(["alumni", "ledger"]);
    expect(shown.map((entry) => entry.isPrivate)).toEqual([true, false]);
  });

  it("shows nothing for an app the membership view did not mention", () => {
    expect(visibleApps(catalog, [])).toEqual([]);
  });
});

describe("the launcher grid", () => {
  it("links each tile to the app and to its page", () => {
    const html = render({
      kind: "ready",
      apps: visibleApps(catalog, [told("alumni", { canOpen: true })]),
    });
    expect(html).toContain('href="/apps/alumni"');
    expect(html).toContain('href="/about/alumni"');
    expect(html).toContain("Private");
    expect(html).not.toContain("notes app");
  });

  it("tells someone with no apps that none have been shared yet", () => {
    expect(render({ kind: "ready", apps: [] })).toContain("No apps have been shared with you yet.");
  });

  it("offers the way in to making an app, under the tiles and when there are none", () => {
    const link = '<a href="/build">Make an app with your AI</a>';
    const tiles = visibleApps(catalog, [told("alumni", { canOpen: true })]);
    expect(render({ kind: "ready", apps: tiles, canMake: true })).toContain(link);
    const empty = render({ kind: "ready", apps: [], canMake: true });
    expect(empty).toContain("No apps have been shared with you yet.");
    expect(empty).toContain(link);
  });

  it("does not offer it while member apps are switched off, or before a person can use Slice", () => {
    const tiles = visibleApps(catalog, [told("alumni", { canOpen: true })]);
    const states: Parameters<typeof AppGridView>[0]["state"][] = [
      { kind: "ready", apps: tiles },
      { kind: "ready", apps: tiles, canMake: false },
      { kind: "ready", apps: [] },
      { kind: "join" },
      { kind: "error" },
      { kind: "loading" },
    ];
    for (const state of states) expect(render(state)).not.toContain("Make an app");
  });

  it("sends someone with no profile to their account instead of showing tiles", () => {
    const html = render({ kind: "join" });
    expect(html).toContain('href="/account"');
    expect(html).not.toContain("/apps/");
  });

  it("says so when apps could not be loaded", () => {
    expect(render({ kind: "error" })).toContain("Your apps could not be loaded.");
  });

  it("marks the grid busy while it loads", () => {
    expect(render({ kind: "loading" })).toContain('aria-busy="true"');
  });
});
