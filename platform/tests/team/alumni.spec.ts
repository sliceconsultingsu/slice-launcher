import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("a beginner can open the real directory with synthetic data on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Find a connection. Build your next step." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alex Example", exact: true })).toBeVisible();
  await expect(page.getByText("Learning preview", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Casey Example" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test("failed loads can be retried without showing stale data", async ({ page }) => {
  await page.route("**/api/apps/alumni/records", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("couldn’t load");
  await page.unroute("**/api/apps/alumni/records");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Alex Example", exact: true })).toBeVisible();
});
test("empty results are understandable", async ({ page }) => {
  await page.route("**/api/apps/alumni/records", (route) =>
    route.fulfill({ json: { dataset: "synthetic", alumni: [], students: [] } }),
  );
  await page.goto("/");
  await expect(page.getByText("No alumni found.")).toBeVisible();
});
test("preview rejects cross-site callers and private files; API stays read-only", async ({
  request,
  baseURL,
}) => {
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
  expect((await request.get("/.env")).status()).toBeGreaterThanOrEqual(400);
  expect((await request.get("/../.git/config")).status()).toBeGreaterThanOrEqual(400);
});
