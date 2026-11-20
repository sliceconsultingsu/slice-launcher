import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { identityToken } from "./identity";

// Runs after membership.spec.ts, like settings.spec.ts: that test onboards the owner for the first
// time, and these join the owner without the onboarding screens. Files run in name order.
//
// Apps members made, end to end, with invented people: an owner, Riley (who makes an app) and
// Noor (an ordinary member). The harness stands in for Riley's AI creating and publishing it.
const ADDRESS = "https://team-notes.apps.slice-e2e-only.test";

async function signIn(browser: Browser, email: string) {
  const context = await browser.newContext({
    extraHTTPHeaders: { "Cf-Access-Jwt-Assertion": await identityToken(email) },
  });
  return { context, page: await context.newPage() };
}
const origin = () => new URL(test.info().project.use.baseURL!).origin;
async function send(context: BrowserContext, command: unknown) {
  const current = await (await context.request.get("/api/membership")).json();
  const response = await context.request.post("/api/membership", {
    headers: { origin: origin() },
    data: { revision: current.revision, command },
  });
  expect(response.status(), JSON.stringify(command)).toBe(200);
  return response.json();
}
async function member(owner: BrowserContext, context: BrowserContext, name: string) {
  const joined = await send(context, { type: "join" });
  await send(context, { type: "profile.update", name, title: "Consultant" });
  await send(owner, {
    type: "member.update",
    id: joined.me.id,
    status: "active",
    levelId: "member",
    allow: [],
    deny: [],
    owner: false,
  });
}
async function accessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })),
  ).toEqual([]);
}
const saved = (page: Page) => expect(page.getByRole("status")).toHaveText("Changes saved.");

test("a member's app appears in the launcher, goes Public with the owner's OK, and can be stopped", async ({
  browser,
}) => {
  const owner = await signIn(browser, "owner@example.test");
  const riley = await signIn(browser, "riley@example.test");
  const noor = await signIn(browser, "noor@example.test");
  try {
    await send(owner.context, { type: "join" });
    await member(owner.context, riley.context, "Riley Example");
    await member(owner.context, noor.context, "Noor Example");
    const published = await riley.context.request.post("/__e2e/member-app", {
      headers: { origin: origin() },
      data: {
        id: "team-notes",
        name: "Team notes",
        description: "Notes the team shares.",
        guide: "Write a note, and everyone on the app sees it.",
        powers: [{ id: "edit", label: "Edit notes" }],
        files: [{ path: "index.html", text: "<!doctype html><title>Team notes</title>" }],
      },
    });
    expect(published.status()).toBe(200);

    // Riley sees the app under its own heading, opening at its own address.
    await riley.page.goto("/");
    await expect(riley.page.getByRole("heading", { name: "Made by members" })).toBeVisible();
    await expect(riley.page.getByRole("link", { name: "Open Team notes" })).toHaveAttribute(
      "href",
      ADDRESS,
    );
    await accessible(riley.page);
    // Noor, who is not on it, is told nothing about it.
    await noor.page.goto("/");
    await expect(noor.page.getByText("Team notes")).toHaveCount(0);
    await noor.page.goto("/about/team-notes");
    await expect(noor.page.getByText("There is no app here that you can open.")).toBeVisible();
    await accessible(noor.page);

    // Riley's page for the app: guide, settings, versions.
    await riley.page.goto("/about/team-notes");
    await expect(riley.page.getByRole("heading", { name: "Team notes", level: 1 })).toBeVisible();
    await expect(
      riley.page.getByText("Write a note, and everyone on the app sees it."),
    ).toBeVisible();
    await expect(riley.page.getByText("Version 1 is live")).toBeVisible();
    await accessible(riley.page);
    await riley.page.screenshot({
      path: test.info().outputPath("member-app-page-manager-desktop.png"),
      fullPage: true,
    });

    // Asking for Public keeps it Private and tells the owner.
    await riley.page.getByRole("radio", { name: /^Public/ }).check();
    await riley.page.getByRole("button", { name: "Save changes" }).click();
    await saved(riley.page);
    await expect(riley.page.getByText("Waiting for the Slice owner's OK.")).toBeVisible();
    await noor.page.goto("/");
    await expect(noor.page.getByText("Team notes")).toHaveCount(0);

    await owner.page.goto("/");
    await expect(owner.page.getByText("Waiting for your OK to be Public:")).toBeVisible();
    await accessible(owner.page);
    await owner.page.getByRole("status").getByRole("link", { name: "Team notes" }).click();
    await expect(owner.page.getByText(/Riley Example asked for this/)).toBeVisible();
    await owner.page.getByRole("radio", { name: /^Public/ }).check();
    await owner.page.getByRole("button", { name: "Save changes" }).click();
    await expect(owner.page.getByRole("alert")).toContainText(
      /This opens Team notes to all \d+ active members/,
    );
    await owner.page.getByRole("button", { name: "Open to everyone" }).click();
    await saved(owner.page);

    // Now every member has it.
    await noor.page.goto("/");
    await expect(noor.page.getByRole("link", { name: "Open Team notes" })).toHaveAttribute(
      "href",
      ADDRESS,
    );
    await noor.page.goto("/about/team-notes");
    await expect(
      noor.page.getByText("Write a note, and everyone on the app sees it."),
    ).toBeVisible();
    await expect(noor.page.getByRole("heading", { name: "Manage this app" })).toHaveCount(0);
    await accessible(noor.page);

    // Riley takes it offline: nobody can open it, and the launcher says so.
    await riley.page.goto("/about/team-notes");
    await riley.page.getByRole("button", { name: "Take offline" }).click();
    await saved(riley.page);
    await expect(riley.page.getByText("Offline. Nobody can open it.")).toBeVisible();
    await accessible(riley.page);
    await noor.page.goto("/");
    await expect(noor.page.getByText("Offline")).toBeVisible();
    await expect(noor.page.getByRole("link", { name: "Open Team notes" })).toHaveCount(0);

    // And puts version 1 back.
    await riley.page.getByRole("button", { name: "Make version 1 live" }).click();
    await saved(riley.page);
    await expect(riley.page.getByText("Version 1 is live")).toBeVisible();

    // A preview is shown only to the people who run the app, and can be discarded.
    const preview = await riley.context.request.post("/__e2e/member-app", {
      headers: { origin: origin() },
      data: {
        id: "team-notes",
        preview: true,
        name: "Team notes",
        description: "Notes the team shares.",
        guide: "The next version of the guide.",
        files: [{ path: "index.html", text: "<!doctype html><title>Team notes, next</title>" }],
      },
    });
    expect(preview.status()).toBe(200);
    await riley.page.reload();
    await expect(riley.page.getByText(/Version 2 is a preview/)).toBeVisible();
    await expect(riley.page.getByText("The next version of the guide.")).toBeVisible();
    await accessible(riley.page);
    await noor.page.goto("/about/team-notes");
    await expect(
      noor.page.getByText("Write a note, and everyone on the app sees it."),
    ).toBeVisible();
    await riley.page.getByRole("button", { name: "Discard preview" }).click();
    await saved(riley.page);
    await expect(riley.page.getByText(/Version 2 is a preview/)).toHaveCount(0);

    // Deleting asks first, then the app is gone for everyone.
    await riley.page.getByRole("button", { name: "Delete this app" }).click();
    await expect(riley.page.getByRole("alert")).toContainText("its ID can never be used again");
    await accessible(riley.page);
    await riley.page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(riley.page.getByText("There is no app here that you can open.")).toBeVisible();
    await noor.page.goto("/");
    await expect(noor.page.getByText("Team notes")).toHaveCount(0);
  } finally {
    await owner.context.close();
    await riley.context.close();
    await noor.context.close();
  }
});
