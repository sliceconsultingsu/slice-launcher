import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { State } from "../../src/membership/contracts";
import type { AppDescriptor } from "../../src/platform/contracts";
import { createPlatform } from "../../src/platform/dispatch";
import descriptor from "./app.json";
import { EXAMPLE, PROMPT } from "./content";
import { StatusReportsPage } from "./page";
import statusReports from "./server";

const guide = readFileSync(join(__dirname, "guide.md"), "utf8");
const html = renderToStaticMarkup(createElement(StatusReportsPage));

/** The platform with one synthetic member. `powers` is null when they are not on the app. */
function host(powers: string[] | null, catalog: AppDescriptor = descriptor) {
  const state: State = {
    revision: 0,
    ownerEmail: null,
    ownerClaimed: true,
    levels: [],
    members: [
      {
        id: "pm",
        subject: "test|pm",
        email: "pm@example.test",
        name: "Test PM",
        title: "",
        status: "active",
        levelId: null,
        allow: [],
        deny: [],
        owner: false,
        joinedAt: "2026-11-20",
      },
    ],
    apps: [
      {
        id: "status-reports",
        visibility: "private",
        managers: [],
        people: powers ? [{ memberId: "pm", powers }] : [],
      },
    ],
  };
  return createPlatform({
    catalog: [catalog],
    modules: new Map([["status-reports", statusReports]]),
    verify: async () => ({ subject: "test|pm", email: "pm@example.test" }),
    loadState: async () => state,
  });
}
const pageRequest = () => new Request("https://slice.example/apps/status-reports");

it("declares one ordinary-use permission and is marked work in progress", () => {
  expect(descriptor.workInProgress).toBe(true);
  expect(descriptor.permissions).toEqual([
    expect.objectContaining({ id: "use", withAccess: true }),
  ]);
});

it("opens for a member who has the app", async () => {
  await expect(
    host([]).page(pageRequest(), "status-reports", { path: [], searchParams: {} }),
  ).resolves.toBeDefined();
});

it("denies the page to a member who is not on the app", async () => {
  await expect(
    host(null).page(pageRequest(), "status-reports", { path: [], searchParams: {} }),
  ).rejects.toMatchObject({ status: 403 });
});

it("still checks the use permission if it stops coming with access", async () => {
  const strict = { ...descriptor, permissions: [{ id: "use", label: "Use" }] };
  await expect(
    host([], strict).page(pageRequest(), "status-reports", { path: [], searchParams: {} }),
  ).rejects.toMatchObject({ status: 403 });
});

it("has no API, so nothing can be stored or sent through it", () => {
  expect("api" in statusReports).toBe(false);
  expect("tools" in statusReports).toBe(false);
});

it("shows the sensitive-project warning before the prompt", () => {
  const warning = html.indexOf("sensitive and NDA projects");
  const prompt = html.indexOf('id="status-report-prompt"');
  expect(warning).toBeGreaterThan(-1);
  expect(prompt).toBeGreaterThan(warning);
});

it("tells project managers the app is a work in progress", () => {
  expect(html).toContain("Work in progress");
});

it("puts the same prompt in the app and the guide", () => {
  expect(guide).toContain(PROMPT);
  const escaped = PROMPT.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
  expect(html).toContain(escaped);
});

it("shows the guide's warning before its prompt", () => {
  expect(guide.indexOf("sensitive and NDA projects")).toBeGreaterThan(-1);
  expect(guide.indexOf(PROMPT)).toBeGreaterThan(guide.indexOf("sensitive and NDA projects"));
});

it("uses only the fictional example and no contact details", () => {
  expect(EXAMPLE.client).toBe("Harbor Light Community Fund");
  expect(html).toContain("Avery Brooks [AB]");
  for (const text of [html, guide]) {
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(text).not.toMatch(/\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}/);
  }
});

it("keeps completed work in past tense and planned work in future tense", () => {
  for (const workstream of EXAMPLE.workstreams) {
    for (const line of workstream.completed) expect(line).toMatch(/^\[[A-Z]{2}\] \w+ed /);
    for (const line of workstream.planned) expect(line).not.toMatch(/^\[[A-Z]{2}\] \w+ed /);
  }
});
