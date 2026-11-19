import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { identityToken } from "./identity";

// App settings end to end, with invented people: an owner, Morgan (who comes to run the app)
// and Olive (an ordinary member).
const POWER = "Manage alumni data and review proposed changes";

async function signIn(browser: Browser, email: string) {
  const context = await browser.newContext({
    extraHTTPHeaders: { "Cf-Access-Jwt-Assertion": await identityToken(email) },
  });
  return { context, page: await context.newPage() };
}
async function send(context: BrowserContext, command: unknown) {
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const current = await (await context.request.get("/api/membership")).json();
  const response = await context.request.post("/api/membership", {
    headers: { origin },
    data: { revision: current.revision, command },
  });
  expect(response.status(), JSON.stringify(command)).toBe(200);
  return response.json();
}
/** Joins as this person, names them, and has the owner approve them. */
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
  return joined.me.id as string;
}
async function accessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })),
  ).toEqual([]);
}
async function saved(page: Page) {
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
}

test("an owner opens an app to everyone, then to named people, and hands it to a manager", async ({
  browser,
}) => {
  const owner = await signIn(browser, "owner@example.test");
  const morgan = await signIn(browser, "morgan@example.test");
  const olive = await signIn(browser, "olive@example.test");
  try {
    await send(owner.context, { type: "join" });
    const morganId = await member(owner.context, morgan.context, "Morgan Example");
    await member(owner.context, olive.context, "Olive Example");
    // Start from an app nobody has been given.
    await send(owner.context, {
      type: "app.update",
      id: "alumni",
      visibility: "private",
      managers: [],
      people: [],
    });

    // A member with no apps sees none, and is told who to ask on the app's page.
    await olive.page.goto("/");
    await expect(olive.page.getByText("No apps have been shared with you yet.")).toBeVisible();
    await expect(olive.page.getByRole("link", { name: /^Open/ })).toHaveCount(0);
    await accessible(olive.page);
    await olive.page.goto("/about/alumni");
    await expect(olive.page.getByText("This app is private.")).toBeVisible();
    await expect(olive.page.getByText("Ask the Slice owner for access.")).toBeVisible();
    await expect(olive.page.getByRole("heading", { name: "Manage this app" })).toHaveCount(0);
    await accessible(olive.page);
    expect((await olive.context.request.get("/api/membership")).status()).toBe(200);

    // The owner opens it to everyone, after being told how many people that reaches.
    await owner.page.goto("/about/alumni");
    await expect(owner.page.getByRole("heading", { name: "Manage this app" })).toBeVisible();
    await accessible(owner.page);
    await owner.page.screenshot({
      path: test.info().outputPath("app-page-owner-desktop.png"),
      fullPage: true,
    });
    await owner.page.getByRole("radio", { name: /^Public/ }).check();
    await owner.page.getByRole("button", { name: "Save changes" }).click();
    await expect(owner.page.getByRole("alert")).toContainText(
      /This opens Alumni directory to all \d+ active members/,
    );
    await accessible(owner.page);
    await owner.page.getByRole("button", { name: "Cancel" }).click();
    await expect(owner.page.getByRole("button", { name: "Save changes" })).toBeVisible();
    await owner.page.getByRole("button", { name: "Save changes" }).click();
    await owner.page.getByRole("button", { name: "Open to everyone" }).click();
    await saved(owner.page);
    await expect(owner.page.getByText(/^Public · Run by the Slice owner/)).toBeVisible();

    await olive.page.goto("/");
    await expect(olive.page.getByRole("heading", { name: "Alumni directory" })).toBeVisible();
    await expect(
      olive.page.getByRole("link", { name: "Details for Alumni directory" }),
    ).toHaveAttribute("href", "/about/alumni");
    await accessible(olive.page);
    await olive.page.screenshot({
      path: test.info().outputPath("launcher-member-desktop.png"),
      fullPage: true,
    });

    // Back to private: Olive is added by name with one extra power, and Morgan runs the app.
    await owner.page.getByRole("radio", { name: /^Private/ }).check();
    await owner.page
      .getByLabel("Add a person")
      .selectOption({ label: "Olive Example (olive@example.test)" });
    await owner.page.getByRole("button", { name: "Add person" }).click();
    await owner.page.getByRole("checkbox", { name: `${POWER} for Olive Example` }).check();
    await owner.page
      .getByLabel("Add a manager")
      .selectOption({ label: "Morgan Example (morgan@example.test)" });
    await owner.page.getByRole("button", { name: "Add manager" }).click();
    await owner.page.getByRole("button", { name: "Save changes" }).click();
    await saved(owner.page);
    await expect(owner.page.getByText("Private · Run by Morgan Example")).toBeVisible();
    await owner.page.setViewportSize({ width: 390, height: 844 });
    await accessible(owner.page);
    await owner.page.screenshot({
      path: test.info().outputPath("app-page-owner-mobile.png"),
      fullPage: true,
    });
    await owner.page.setViewportSize({ width: 1280, height: 720 });
    const olivesView = await (await olive.context.request.get("/api/membership")).json();
    expect(olivesView.permissions).toContain("app.alumni.admin");
    expect(olivesView.permissions).not.toContain("app.alumni.refresh.run");

    // Olive sees the guide and the way in, with no settings. Morgan sees the settings.
    await olive.page.goto("/about/alumni");
    await expect(olive.page.getByText("Private · Run by Morgan Example")).toBeVisible();
    await expect(olive.page.getByRole("link", { name: "Open Alumni directory" })).toBeVisible();
    await expect(olive.page.getByRole("heading", { name: "Manage this app" })).toHaveCount(0);
    await olive.page.setViewportSize({ width: 390, height: 844 });
    await accessible(olive.page);
    await olive.page.screenshot({
      path: test.info().outputPath("app-page-member-mobile.png"),
      fullPage: true,
    });
    await morgan.page.goto("/about/alumni");
    await expect(morgan.page.getByRole("heading", { name: "Manage this app" })).toBeVisible();
    await accessible(morgan.page);
    // A manager sees names, never addresses.
    await expect(morgan.page.getByText("@example.test")).toHaveCount(0);

    // Morgan takes Olive off the app; Olive loses it at once.
    await morgan.page.getByRole("button", { name: "Remove Olive Example from people" }).click();
    await morgan.page.getByRole("button", { name: "Save changes" }).click();
    await saved(morgan.page);
    await olive.page.goto("/");
    await expect(olive.page.getByText("No apps have been shared with you yet.")).toBeVisible();

    // The server refuses a member who tries to change settings directly.
    const current = await (await olive.context.request.get("/api/membership")).json();
    const attempt = await olive.context.request.post("/api/membership", {
      headers: { origin: new URL(olive.page.url()).origin },
      data: {
        revision: current.revision,
        command: {
          type: "app.update",
          id: "alumni",
          visibility: "public",
          managers: [morganId],
          people: [],
        },
      },
    });
    expect(attempt.status()).toBe(403);

    // A save made from an out-of-date page is refused and says to reload.
    await owner.page.goto("/about/alumni");
    await expect(owner.page.getByRole("heading", { name: "Manage this app" })).toBeVisible();
    await send(morgan.context, {
      type: "app.update",
      id: "alumni",
      visibility: "private",
      managers: [morganId],
      people: [],
    });
    await owner.page.getByRole("radio", { name: /^Public/ }).check();
    await owner.page.getByRole("button", { name: "Save changes" }).click();
    await owner.page.getByRole("button", { name: "Open to everyone" }).click();
    await expect(owner.page.getByRole("alert")).toContainText("Reload");
    const after = await (await owner.context.request.get("/api/membership")).json();
    expect(after.apps.find((app: { id: string }) => app.id === "alumni").visibility).toBe(
      "private",
    );
  } finally {
    await owner.context.close();
    await morgan.context.close();
    await olive.context.close();
  }
});

test("someone with no profile, or not yet approved, is sent to their account", async ({
  browser,
}) => {
  const newcomer = await signIn(browser, "newcomer@example.test");
  try {
    await newcomer.page.goto("/");
    await expect(
      newcomer.page.getByText("Finish setting up your account to see your apps."),
    ).toBeVisible();
    await newcomer.page.goto("/about/alumni");
    await expect(newcomer.page.getByText(/membership is not active yet/)).toBeVisible();
    await send(newcomer.context, { type: "join" });
    await newcomer.page.goto("/about/alumni");
    await expect(newcomer.page.getByText(/membership is not active yet/)).toBeVisible();
    await expect(newcomer.page.getByRole("link", { name: "Go to your account" })).toBeVisible();
    await accessible(newcomer.page);
    await newcomer.page.goto("/");
    await expect(newcomer.page.getByText("No apps have been shared with you yet.")).toBeVisible();
  } finally {
    await newcomer.context.close();
  }
});

test("a signed-out visitor to an app's page is offered sign-in", async ({ page }) => {
  await page.goto("/about/alumni");
  await expect(page.getByRole("link", { name: "Sign in with Google" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Manage this app" })).toHaveCount(0);
});
