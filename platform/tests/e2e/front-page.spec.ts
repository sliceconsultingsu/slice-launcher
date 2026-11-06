import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { identityToken } from "./identity";

test("signed-out visitors see the Slice front page with Google sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Slice Consulting", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in with Google" })).toHaveAttribute(
    "href",
    "/api/auth/google/start",
  );
  await expect(page.getByRole("heading", { name: "Applications" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Slice Consulting home" })).toBeVisible();
  for (const [name, width, height] of [
    ["desktop", 1280, 960],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations.map(({ id }) => id)).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`front-page-${name}.png`),
      fullPage: true,
    });
  }
});

test("signed-in people still land on the launcher", async ({ browser }) => {
  const context = await browser.newContext({
    extraHTTPHeaders: { "Cf-Access-Jwt-Assertion": await identityToken("visitor@example.test") },
  });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Applications", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in with Google" })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
