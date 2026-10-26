import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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
