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
    // Noor, who is not on it, is told nothing about it, and is shown how to make one of her own.
    await noor.page.goto("/");
    await expect(noor.page.getByText("Team notes")).toHaveCount(0);
    await expect(noor.page.getByRole("link", { name: /Making an app/ })).toHaveAttribute(
      "href",
      /\/docs\/building-an-app\.md$/,
    );
    await accessible(noor.page);
    await noor.page.screenshot({
      path: test.info().outputPath("launcher-make-an-app-desktop.png"),
      fullPage: true,
    });
    await noor.page.getByRole("link", { name: "Make an app with your AI" }).click();
    await expect(noor.page).toHaveURL(/\/build$/);
    await expect(noor.page.getByRole("heading", { name: "Build", level: 1 })).toBeVisible();
    await noor.page.goto("/connect-ai");
    await expect(noor.page.getByRole("heading", { name: "Make an app" })).toBeVisible();
    await expect(noor.page.getByText(/such as the Alumni directory/)).toBeVisible();
    await expect(noor.page.getByText(/no business apps/)).toHaveCount(0);
    await accessible(noor.page);
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

test("a member starts an app on the Build page, hands it to their AI, and brings it live", async ({
  browser,
}) => {
  const owner = await signIn(browser, "owner@example.test");
  const riley = await signIn(browser, "riley@example.test");
  const noor = await signIn(browser, "noor@example.test");
  const page = riley.page;
  const address = "https://kickoff-checklist.apps.slice-e2e-only.test";
  try {
    await riley.context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await send(owner.context, { type: "join" });
    await member(owner.context, riley.context, "Riley Example");
    await member(owner.context, noor.context, "Noor Example");

    // From the launcher, Build is one step away, and says how making an app goes.
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Sections" })
      .getByRole("link", { name: "Build" })
      .click();
    await expect(page).toHaveURL(/\/build$/);
    await expect(page.getByRole("heading", { name: "Build", level: 1 })).toBeVisible();
    await expect(page.getByText("Hand it to your AI.")).toBeVisible();
    await expect(page.getByText("You have not started an app yet.")).toBeVisible();
    await accessible(page);

    // Nothing to send yet: the page says what is missing.
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByRole("alert")).toHaveText("Say what the app should help with.");

    // Describing it: the address follows the name, and the page says what cannot work yet.
    await page
      .getByLabel("What should it help with?")
      .fill("A checklist for kicking off a new client project.");
    await page.getByLabel("Name").fill("Kickoff checklist");
    await expect(page.getByLabel("Address")).toHaveValue("kickoff-checklist");
    await expect(
      page.getByText("kickoff-checklist.apps.slice-e2e-only.test. It cannot be changed later."),
    ).toBeVisible();
    await page.getByLabel(/It needs to remember what people enter/).check();
    await expect(page.getByText(/Apps cannot save or share data yet/)).toBeVisible();
    await accessible(page);
    await page.screenshot({
      path: test.info().outputPath("build-start-desktop.png"),
      fullPage: true,
    });
    await page.getByLabel(/It needs to remember what people enter/).uncheck();
    await expect(page.getByText(/Apps cannot save or share data yet/)).toHaveCount(0);

    // Creating the draft: it is listed at once, with the brief for Riley's AI ready to copy.
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByRole("status").first()).toContainText("Draft created.");
    const row = page.getByRole("listitem").filter({ hasText: "Kickoff checklist" });
    await expect(row.getByText("Draft", { exact: true })).toBeVisible();
    await expect(row.getByText("Waiting for your AI to publish a first preview.")).toBeVisible();
    await expect(page.getByText("1 of 5 apps used")).toBeVisible();
    await expect(page.getByLabel("Name")).toHaveValue("");
    await row.getByRole("button", { name: "Copy the brief for Kickoff checklist" }).click();
    const brief = await page.evaluate(() => navigator.clipboard.readText());
    expect(brief).toContain("App ID: kickoff-checklist");
    expect(brief).toContain("Who it is for: my project team");
    expect(brief).toContain("Do not call slice_app_create");
    await accessible(page);
    await page.screenshot({
      path: test.info().outputPath("build-draft-desktop.png"),
      fullPage: true,
    });

    // The same address cannot be taken twice; the launcher's own words are shown.
    await page.getByLabel("What should it help with?").fill("Another one.");
    await page.getByLabel("Name").fill("Kickoff checklist");
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByRole("alert")).toHaveText("That ID is already in use. Choose another.");

    // Riley's AI publishes a preview (the harness stands in for it). The page shows it on request.
    const published = await riley.context.request.post("/__e2e/member-app", {
      headers: { origin: origin() },
      data: {
        id: "kickoff-checklist",
        preview: true,
        name: "Kickoff checklist",
        description: "A checklist for kicking off a new client project.",
        guide: "Tick each step as you go.",
        files: [{ path: "index.html", text: "<!doctype html><title>Kickoff checklist</title>" }],
      },
    });
    expect(published.status()).toBe(200);
    await page.getByRole("button", { name: "Check again" }).click();
    await expect(row.getByText("Preview ready", { exact: true })).toBeVisible();
    await expect(row.getByRole("link", { name: /Open preview/ })).toHaveAttribute("href", address);
    await expect(row.getByText("The brief for your AI")).toHaveCount(0);
    await accessible(page);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await accessible(page);
    await page.screenshot({
      path: test.info().outputPath("build-preview-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });

    // Riley makes it live from here, and shares it from its own page.
    await row.getByRole("button", { name: /Make it live/ }).click();
    await expect(page.getByRole("status").first()).toContainText("It is live.");
    await expect(row.getByText("Live", { exact: true })).toBeVisible();
    await expect(
      row.getByText("Version 1 is live, and private to the people who run it."),
    ).toBeVisible();
    await expect(row.getByRole("link", { name: /^Open/ })).toHaveAttribute("href", address);
    await expect(row.getByRole("link", { name: /^Share/ })).toHaveAttribute(
      "href",
      "/about/kickoff-checklist",
    );
    await accessible(page);

    // The list is each person's own: Noor sees none of Riley's, and the owner is not shown
    // every member's apps here either.
    await noor.page.goto("/build");
    await expect(noor.page.getByText("You have not started an app yet.")).toBeVisible();
    await owner.page.goto("/build");
    await expect(owner.page.getByRole("heading", { name: "Your apps" })).toBeVisible();
    await expect(owner.page.getByText("Kickoff checklist")).toHaveCount(0);
  } finally {
    await send(riley.context, { type: "memberapp.delete", id: "kickoff-checklist" }).catch(
      () => {},
    );
    await owner.context.close();
    await riley.context.close();
    await noor.context.close();
  }
});
