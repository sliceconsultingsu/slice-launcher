import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const accessible = async (page: Page) =>
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

test("a beginner can explore fictional alumni on desktop and mobile", async ({ page }) => {
  await page.goto("/apps/alumni/explore");
  await expect(page.getByRole("heading", { name: "Explore alumni", level: 1 })).toBeVisible();
  await expect(page.getByText("Learning preview", { exact: true })).toBeVisible();
  await expect(page.getByText("Work in progress", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Marcus Bellweather" })).toBeVisible();
  await expect(page.getByText("28 alumni")).toBeVisible();
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
  await page.getByRole("combobox", { name: /^Industry/ }).selectOption({ label: "Consulting" });
  await expect(page.getByText("4 alumni")).toBeVisible();
  await expect(page.getByRole("link", { name: "Marcus Bellweather" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Aisha Bello" })).toHaveCount(0);
  await page.getByRole("combobox", { name: /^City/ }).selectOption({ label: "New York, NY" });
  await expect(page.getByText("2 alumni")).toBeVisible();
  // The search is in the address, so it survives a reload.
  await page.reload();
  await expect(page.getByText("2 alumni")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByText("28 alumni")).toBeVisible();
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
  await page.getByLabel("Search by name or employer").fill("nobody by this name");
  await page.getByRole("button", { name: "Search alumni" }).click();
  await expect(page.getByText("No alumni found. Clear the filters to see everyone.")).toBeVisible();
  // Ben Gutierrez (p-a20) has no contact details, and no refresh check yet.
  await page.goto("/apps/alumni/alumni/p-a20");
  await expect(page.getByRole("heading", { name: "Ben Gutierrez" })).toBeVisible();
  await expect(page.getByText("This alum has no contact details to share yet.")).toBeVisible();
  await expect(page.getByText("This profile has not been checked yet.")).toBeVisible();
  await accessible(page);
  await page.goto("/apps/alumni/alumni/nobody");
  await expect(page.getByRole("alert")).toContainText("No listed alum has that ID.");
  await page.goto("/apps/alumni/somewhere-else");
  await expect(page.getByText("There is nothing at this address.")).toBeVisible();
});
test("a new student sets up a profile, lands on matches and records an outcome", async ({
  page,
}) => {
  await page.goto("/apps/alumni");
  await expect(page.getByRole("heading", { name: "Set up your profile", level: 1 })).toBeVisible();
  await accessible(page);
  // Saving too early says what is missing instead of failing silently.
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("alert")).toContainText("Choose your major");
  await page.getByRole("combobox", { name: /^Major/ }).selectOption({ label: "Finance" });
  await page.getByLabel("Graduation year").fill("2028");
  await page.getByLabel("Career goal (optional)").fill("Work in strategy consulting.");
  await page.getByRole("checkbox", { name: "Consulting" }).check();
  await page.getByRole("checkbox", { name: "Case interview practice" }).check();
  await page.getByRole("checkbox", { name: "Excel and spreadsheets" }).check();
  await page.getByRole("checkbox", { name: "Boston, MA" }).check();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("heading", { name: "Your alumni matches", level: 1 })).toBeVisible();
  const matches = page
    .getByRole("list")
    .filter({ hasText: "Why this match" })
    .getByRole("listitem");
  await expect(page.getByText("You have 3 new matches.")).toBeVisible();
  await expect(matches.filter({ hasText: "Why this match" })).toHaveCount(3);
  await expect(page.getByText("Works in Consulting, an industry you chose").first()).toBeVisible();
  await accessible(page);
  const contacted = page.getByRole("button", { name: "I contacted them" }).first();
  await contacted.click();
  await expect(contacted).toHaveAttribute("aria-pressed", "true");
  // Reopening changes nothing until the period has passed: same matches, outcome kept.
  await page.reload();
  await expect(page.getByText("Your next matches arrive on")).toBeVisible();
  await expect(page.getByRole("button", { name: "I contacted them" }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await noSidewaysScroll(page)).toBe(true);
});
test("a student can change their answers and see them after reloading", async ({ page }) => {
  await page.goto("/apps/alumni/profile");
  await expect(page.getByLabel("Graduation year")).toHaveValue("2028");
  await expect(page.getByRole("checkbox", { name: "Consulting" })).toBeChecked();
  await page.getByRole("checkbox", { name: "Technology" }).check();
  await page.getByLabel("Graduation year").fill("2029");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Your profile is saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Graduation year")).toHaveValue("2029");
  await expect(page.getByRole("checkbox", { name: "Technology" })).toBeChecked();
});
test("an admin reviews a proposed change by keyboard, on desktop and mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/apps/alumni/review");
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
  await expect(page.getByText(/Senior Consultant · Bluestone Advisory Group/)).toBeVisible();
});
test("an admin hides a contact detail and an alum, and lists the alum again", async ({ page }) => {
  await page.goto("/apps/alumni/alumni/p-a09");
  await expect(page.getByRole("link", { name: "marcus.b@example.com" })).toBeVisible();
  await page.getByRole("button", { name: /^Hide from members Email/ }).click();
  await expect(page.getByRole("button", { name: /^Show to members Email/ })).toBeVisible();
  await page.getByRole("button", { name: "Hide this alum from members" }).click();
  await expect(page.getByText("Hidden from members")).toBeVisible();
  await page.goto("/apps/alumni/explore");
  await expect(page.getByText("27 alumni")).toBeVisible();
  await page.getByRole("checkbox", { name: "Include alumni hidden from members" }).check();
  await expect(page.getByText("29 alumni")).toBeVisible();
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
      "Name\tGraduation year\tMajor\tEmployer\tTitle\tIndustry\tCity\tState\tShoe size",
      "Dana Whitcombe\t2019\tFinance\tJuniper Row Partners\tAssociate\tFinancial Services\tAustin\tTX\t9",
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
  await expect(page.getByText("Associate · Juniper Row Partners")).toBeVisible();
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
