import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { agentInstructions, connectionAddress } from "../../src/connect-ai/instructions";

test("consultants can find, copy and read honest AI setup guidance on desktop and mobile", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("link", { name: "Connect your AI", exact: true }).click();
  await expect(page).toHaveURL(/\/connect-ai$/);
  await expect(page.getByRole("heading", { name: "Connect your AI", exact: true })).toBeVisible();
  await expect(page.getByText("Awaiting platform setup", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open your account", exact: true })).toHaveAttribute(
    "href",
    "/account",
  );
  await page.getByRole("button", { name: "Copy agent instructions" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").first()).toHaveText("Copied. Paste it into your AI app.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(agentInstructions);
  await page.getByText("Connection address and full guide", { exact: true }).click();
  await page.getByRole("button", { name: "Copy server address" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(connectionAddress);
  await expect(page.getByRole("link", { name: /Read the full setup guide/ })).toHaveAttribute(
    "href",
    /github.com\/sliceconsultingsu\/slice-launcher\/blob\/main\/docs\/connect-your-ai.md$/,
  );
  await page.getByText("Connection address and full guide", { exact: true }).click();
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
    expect(
      results.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map((node) => node.target),
      })),
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`connect-ai-${name}.png`),
      fullPage: true,
    });
  }
  // Browser restrictions must leave a usable manual copy path instead of claiming success.
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Blocked by browser");
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Copy agent instructions" }).click();
  await expect(page.getByRole("status").first()).toContainText("copy it manually");
  await expect(page.getByLabel("Message for your AI")).toHaveValue(agentInstructions);
  await expect(page.getByLabel("Message for your AI")).toHaveAttribute("readonly", "");
  await page.getByRole("link", { name: "Applications", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Applications", exact: true })).toBeVisible();
});
