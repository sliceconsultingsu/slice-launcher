import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const accessible = async (page: Page) =>
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

const count = (page: Page, text: string) => page.getByText(text, { exact: true });

test("a beginner can browse the fictional network on desktop and mobile", async ({ page }) => {
  await page.goto("/apps/alumni/explore");
  await expect(page.getByRole("heading", { name: "The network", level: 1 })).toBeVisible();
  await expect(page.getByText("Learning preview", { exact: true })).toBeVisible();
  await expect(page.getByText("Work in progress", { exact: true })).toBeVisible();
  await expect(page.getByText("28 Slice alumni, across 16 companies.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Marcus Bellweather" })).toBeVisible();
  await expect(count(page, "28 alumni")).toBeVisible();
  // A hidden alum and a merged record never appear.
  await page.getByRole("button", { name: "Show more alumni" }).click();
  await expect(page.getByRole("link", { name: "Victor Osei" })).toBeVisible();
  await expect(page.getByText("Theo Marchetti")).toHaveCount(0);
  await expect(page.getByText("Patrick Kim")).toHaveCount(0);
  await accessible(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("link", { name: "Aisha Bello" })).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  await accessible(page);
});
test("filters narrow the list, can be combined and cleared", async ({ page }) => {
  await page.goto("/apps/alumni/explore");
  await page.getByRole("button", { name: /^Consulting/ }).click();
  await expect(count(page, "4 alumni")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Consulting/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("link", { name: "Marcus Bellweather" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Aisha Bello" })).toHaveCount(0);
  await page.getByRole("combobox", { name: "City" }).selectOption({ label: "New York, NY" });
  await expect(count(page, "2 alumni")).toBeVisible();
  // The search is in the address, so it survives a reload.
  await page.reload();
  await expect(count(page, "2 alumni")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(count(page, "28 alumni")).toBeVisible();
});
test("failed loads can be retried without showing stale data", async ({ page }) => {
  await page.route("**/api/apps/alumni/alumni?*", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.goto("/apps/alumni/explore");
  await expect(page.getByRole("alert")).toContainText("couldn’t");
  await expect(page.getByRole("link", { name: "Marcus Bellweather" })).toHaveCount(0);
  await page.unroute("**/api/apps/alumni/alumni?*");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: "Marcus Bellweather" })).toBeVisible();
});
test("empty results and missing details say so plainly", async ({ page }) => {
  await page.goto("/apps/alumni/explore");
  await page.getByLabel("Search by name or company").fill("nobody by this name");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No alumni found. Clear the filters to see everyone.")).toBeVisible();
  // Ben Gutierrez (p-a20) has no contact details, and no refresh check yet.
  await page.goto("/apps/alumni/alumni/p-a20");
  await expect(page.getByRole("heading", { name: "Ben Gutierrez", level: 1 })).toBeVisible();
  await expect(page.getByText("This alum has no contact details to share yet.")).toBeVisible();
  await expect(page.getByText("This profile has not been checked yet.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "The path so far" })).toBeVisible();
  await accessible(page);
  await page.goto("/apps/alumni/alumni/nobody");
  await expect(page.getByRole("alert")).toContainText("No listed alum has that ID.");
  await page.goto("/apps/alumni/somewhere-else");
  await expect(page.getByText("There is nothing at this address.")).toBeVisible();
});
test("a new student answers three steps, then goes through the match deck", async ({ page }) => {
  await page.goto("/apps/alumni");
  await expect(
    page.getByRole("heading", { name: "First, a little about you", level: 1 }),
  ).toBeVisible();
  await accessible(page);
  // Moving on too early says what is missing instead of failing silently.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toContainText("Choose your major");
  await page.getByRole("combobox", { name: /^Major/ }).selectOption({ label: "Finance" });
  await page.getByLabel("Graduation year").fill("2028");
  await page.getByLabel(/^Career goal/).fill("Work in strategy consulting.");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Which industries are you curious about?", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toContainText("Choose at least one industry.");
  await page.getByRole("checkbox", { name: "Consulting" }).check();
  await page.getByRole("checkbox", { name: "Boston, MA" }).check();
  await accessible(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox", { name: "Case interview practice" }).check();
  await page.getByRole("checkbox", { name: "Excel and spreadsheets" }).check();
  await page.getByRole("button", { name: "See my matches" }).click();

  await expect(page.getByRole("heading", { name: "Meet your matches", level: 1 })).toBeVisible();
  await expect(page.getByText("You have 3 new matches.")).toBeVisible();
  await expect(page.getByText("Match 1 of 3")).toBeVisible();
  await expect(page.getByText("Works in Consulting, an industry you chose")).toBeVisible();
  await accessible(page);
  // Passing moves to the next alum. Reaching out records it and offers a first message.
  await page.getByRole("button", { name: "Not for me" }).click();
  await expect(page.getByText("Match 2 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Reach out" }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("heading", { name: /^Say hello to / })).toBeVisible();
  await expect(panel.getByLabel(/^A first message you can edit/)).toHaveValue(
    /^Hi \S+, I’m Learner, a member of Slice Consulting at Syracuse University\. I’m interested in Consulting, where you work/,
  );
  await expect(panel.getByText("Marked as reached out.")).toBeVisible();
  await accessible(page);
  await panel.getByRole("button", { name: /^Next: / }).click();
  await expect(page.getByText("Match 3 of 3")).toBeVisible();
  // A decision can be changed, which puts that alum back in the deck.
  await page
    .getByRole("button", { name: /^Change what you decided about / })
    .first()
    .click();
  await expect(page.getByText("Match 1 of 3")).toBeVisible();
  // Reopening changes nothing until the period has passed: same matches, outcome kept.
  await page.reload();
  await expect(page.getByText("Your next matches arrive on")).toBeVisible();
  await expect(page.getByText("You reached out")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await noSidewaysScroll(page)).toBe(true);
  await accessible(page);
});
test("home says where the student stands and what changed lately", async ({ page }) => {
  await page.goto("/apps/alumni");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Hey Learner. Two alumni are still in your deck.",
  );
  await expect(page.getByRole("heading", { name: "Lately in the network" })).toBeVisible();
  await expect(page.getByText("28 alumni joined the network.")).toBeVisible();
  await expect(page.getByText(/Devon Okafor is now Operations Director at /)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where alumni work" })).toBeVisible();
  await accessible(page);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await noSidewaysScroll(page)).toBe(true);
  await accessible(page);
  await page.getByRole("link", { name: "Meet your matches" }).click();
  await expect(page.getByRole("heading", { name: "Meet your matches", level: 1 })).toBeVisible();
});
test("a student can change their answers and see them after reloading", async ({ page }) => {
  await page.goto("/apps/alumni/profile");
  await expect(page.getByRole("heading", { name: "My answers", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Graduation year")).toHaveValue("2028");
  await expect(page.getByRole("checkbox", { name: "Consulting" })).toBeChecked();
  await page.getByRole("checkbox", { name: "Technology" }).check();
  await page.getByLabel("Graduation year").fill("2029");
  await page.getByRole("button", { name: "Save my answers" }).click();
  await expect(page.getByText("Your answers are saved.")).toBeVisible();
  await accessible(page);
  await page.reload();
  await expect(page.getByLabel("Graduation year")).toHaveValue("2029");
  await expect(page.getByRole("checkbox", { name: "Technology" })).toBeChecked();
});
test("an admin reviews a proposed change by keyboard, on desktop and mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/apps/alumni/manage");
  await expect(
    page.getByRole("heading", { name: "Keep the network right", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "1 change waiting for your review" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "28 alumni listed" })).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  await accessible(page);
  await page.getByRole("link", { name: "Review changes" }).click();
  await expect(
    page.getByRole("heading", { name: "Review proposed changes", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Victor Osei" })).toBeVisible();
  await expect(page.getByText("Senior Consultant")).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  await accessible(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await accessible(page);
  const approve = page.getByRole("button", { name: /^Approve/ });
  await approve.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Approved." })).toBeVisible();
  // Nothing is left to review: the empty state.
  await expect(page.getByText("No proposed changes are waiting for review.")).toBeVisible();
  await page.goto("/apps/alumni/alumni/p-a26");
  await expect(page.getByText("Senior Consultant at Bluestone Advisory Group")).toBeVisible();
});
test("an admin hides a contact detail and an alum, and lists the alum again", async ({ page }) => {
  await page.goto("/apps/alumni/alumni/p-a09");
  await expect(page.getByRole("link", { name: "marcus.b@example.com" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Email Marcus" })).toBeVisible();
  await page.getByRole("button", { name: /^Hide from members Email/ }).click();
  await expect(page.getByRole("button", { name: /^Show to members Email/ })).toBeVisible();
  // A hidden address is not offered as a way to reach the alum.
  await expect(page.getByRole("link", { name: "Email Marcus" })).toHaveCount(0);
  await page.getByRole("button", { name: "Hide this alum from members" }).click();
  await expect(page.getByText("Hidden from members")).toBeVisible();
  await page.goto("/apps/alumni/explore");
  await expect(count(page, "27 alumni")).toBeVisible();
  await page.getByRole("checkbox", { name: "Include alumni hidden from members" }).check();
  await expect(count(page, "29 alumni")).toBeVisible();
  await page.goto("/apps/alumni/alumni/p-a09");
  await page.getByRole("button", { name: "List this alum again" }).click();
  await expect(page.getByRole("button", { name: "Hide this alum from members" })).toBeVisible();
});
test("an admin adds alumni by pasting rows, and loading them twice adds nobody", async ({
  page,
}) => {
  await page.goto("/apps/alumni/add");
  await expect(page.getByRole("heading", { name: "Add alumni", level: 1 })).toBeVisible();
  await accessible(page);
  const rows = page.getByLabel(/^Rows from the contact book/);
  await rows.fill("Dana Whitcombe\t2019");
  await expect(page.getByRole("alert")).toContainText("The first row must be the column headings");
  await rows.fill(
    [
      "Name\tGrad Year\tMajor\tCompany\tRole\tIndustry\tCity\tState\tShoe size",
      "Dana Whitcombe\t2019\tFinance\tJuniper Row Partners\tAssociate\tFinance\tAustin\tTX\t9",
      "Gus Unknown\t2018\tUnderwater Basket Weaving",
    ].join("\n"),
  );
  await expect(page.getByText("2 people ready to add.")).toBeVisible();
  await expect(page.getByText("These columns will be ignored: shoe size.")).toBeVisible();
  await page.getByRole("button", { name: "Add alumni" }).click();
  await expect(page.getByText(/Added 1\. Already in the app: 0\./)).toBeVisible();
  await expect(page.getByText(/Row 3 \(Gus Unknown\): .*is not a major on the list/)).toBeVisible();
  await page.getByRole("button", { name: "Add alumni" }).click();
  await expect(page.getByText(/Added 0\. Already in the app: 1\./)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.goto("/apps/alumni/explore?q=whitcombe");
  await expect(page.getByRole("link", { name: "Dana Whitcombe" })).toBeVisible();
  await expect(page.getByText("Juniper Row Partners. Class of 2019.")).toBeVisible();
});
test("an admin sends confirmation emails once, then records a reply", async ({ page }) => {
  await page.goto("/apps/alumni/confirm");
  await expect(
    page.getByRole("heading", { name: "Confirm alumni details", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "11 alumni can be asked now" })).toBeVisible();
  await page.getByText("Read the email before sending").click();
  await expect(page.getByText(/Hi Alex,/)).toBeVisible();
  await accessible(page);
  // Sending takes two deliberate steps, because the emails cannot be taken back.
  await page.getByRole("button", { name: "Send confirmation emails" }).click();
  await expect(page.getByText("These are real emails to real people")).toBeVisible();
  await page.getByRole("button", { name: "Yes, send 11 emails" }).click();
  await expect(page.getByText("11 emails sent.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "0 alumni can be asked now" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send confirmation emails" })).toBeDisabled();
  await expect(page.getByText(/^Asked /).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await noSidewaysScroll(page)).toBe(true);

  await page.getByRole("link", { name: "Record their reply for Jordan Avery" }).first().click();
  await expect(page.getByRole("heading", { name: "Record a reply", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Company")).toHaveValue("Harbor & Pine Capital");
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await accessible(page);
  await page.getByLabel("Role").fill("Vice President");
  await page.getByRole("checkbox", { name: "Resume review" }).check();
  await page.getByLabel("The new detail").fill("jordan.personal@example.com");
  await page.getByRole("button", { name: "Save their reply" }).click();
  await expect(page.getByText(/Saved\. Jordan Avery’s profile is updated/)).toBeVisible();
  await page.getByRole("link", { name: "See the profile" }).click();
  await expect(page.getByText("Vice President at Harbor & Pine Capital")).toBeVisible();
  await expect(page.getByRole("link", { name: "jordan.personal@example.com" })).toBeVisible();
  await expect(page.getByText("Resume review", { exact: true })).toBeVisible();
  await page.goto("/apps/alumni/confirm");
  await expect(page.getByText(/^Answered /)).toHaveCount(1);
  // The reply shows up on the home page as something that changed lately.
  await page.goto("/apps/alumni");
  await expect(page.getByText(/Jordan Avery is happy to help with:/)).toBeVisible();
});
test("preview rejects cross-site callers; API stays read-only", async ({ request, baseURL }) => {
  expect(
    (
      await request.get("/api/apps/alumni/records", { headers: { origin: "https://evil.example" } })
    ).status(),
  ).toBe(403);
  expect((await request.get("/", { headers: { host: "evil.example" } })).status()).toBe(403);
  expect(
    (
      await request.post("/api/apps/alumni/records", {
        data: {},
        headers: { origin: baseURL! },
      })
    ).status(),
  ).toBe(405);
});

test("malformed API paths return a client error", async ({ request }) => {
  expect((await request.get("/api/apps/alumni/%E0")).status()).toBe(400);
});

test("preview requires this run's credentials before serving API or source", async ({
  baseURL,
}) => {
  for (const path of ["/", "/api/apps/alumni/records", "/tests/team/main.tsx"]) {
    const url = new URL(path, baseURL);
    expect((await fetch(url)).status).toBe(401);
    expect(
      (await fetch(url, { headers: { authorization: "Basic bGVhcm5lcjp3cm9uZw==" } })).status,
    ).toBe(401);
  }
});

test("existing private files are denied while an ordinary fixture is reachable", async ({
  request,
}) => {
  const folder = await mkdtemp(fileURLToPath(new URL("./private-check-", import.meta.url)));
  const publicPath = `/tests/team/${folder.split("/").at(-1)}`;
  try {
    await writeFile(`${folder}/control.txt`, "fictional-public-control");
    for (const name of [
      ".env",
      ".dev.vars",
      "example.pem",
      "example.key",
      "example.crt",
      ".slice-workspace.json",
    ]) {
      await writeFile(`${folder}/${name}`, "fictional-private-sentinel");
      for (const path of [`${publicPath}/${name}`, `/@fs${folder}/${name}`]) {
        const response = await request.get(path);
        expect(response.status()).toBeGreaterThanOrEqual(400);
        expect(await response.text()).not.toContain("fictional-private-sentinel");
      }
    }
    expect(await (await request.get(`${publicPath}/control.txt`)).text()).toBe(
      "fictional-public-control",
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("an empty test password cannot start an unauthenticated preview", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", fileURLToPath(new URL("./server.ts", import.meta.url))],
    {
      env: { ...process.env, SLICE_TEAM_TEST_PASSWORD: "" },
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("browser test password must be 32 random bytes");
});
