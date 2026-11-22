// Evaluation-only journeys for consultants and administrators (Area C).
// Synthetic identities only. Journey steps use hard assertions; quality expectations
// (accessibility, layout, focus, plain-language errors) use expect.soft so a single run
// reports every gap. Measurements are written to <EVAL_OUT>/observations/*.json.
import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { identityToken } from "../e2e/identity";

const origin = "http://127.0.0.1:4173";
const evalDir = resolve(process.env.EVAL_OUT ?? "test-results/evaluation");
const shotDir = join(evalDir, "screenshots");
const obsDir = join(evalDir, "observations");
const membershipApi = /\/api\/membership(\?.*)?$/;
const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const viewports = {
  desktop: { viewport: { width: 1280, height: 800 } },
  mobile: {
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
  zoom200: { viewport: { width: 640, height: 400 } },
  reflow320: { viewport: { width: 320, height: 256 } },
} satisfies Record<string, BrowserContextOptions>;
type ViewportName = keyof typeof viewports;

let notes: Record<string, unknown> = {};
const note = (key: string, value: unknown) => {
  notes[key] = value;
};
test.beforeEach(() => {
  notes = {};
});
test.afterEach(async ({ browserName }, info) => {
  await mkdir(obsDir, { recursive: true });
  const slug = info.title.split(" ")[0];
  await writeFile(
    join(obsDir, `${slug}.json`),
    JSON.stringify(
      {
        title: info.title,
        browserName,
        status: info.status,
        durationMs: info.duration,
        errors: info.errors.map((error) => (error.message ?? "").split("\n").slice(0, 3).join(" ")),
        notes,
      },
      null,
      2,
    ),
  );
});

// ---------- identities and API helpers (real signed requests through the harness) ----------
interface ApiMember {
  id: string;
  email?: string;
  name: string;
  status?: string;
  levelId?: string | null;
  allow?: string[];
  deny?: string[];
  owner?: boolean;
}
interface ApiView {
  revision?: number;
  needsEnrollment?: boolean;
  error?: string;
  permissions?: string[];
  me?: ApiMember;
  members?: ApiMember[];
  levels?: { id: string; name: string; permissions: string[] }[];
}
interface Session {
  context: BrowserContext;
  page: Page;
}
async function signed(
  browser: Browser,
  email: string | null,
  vp: ViewportName = "desktop",
  extra: BrowserContextOptions = {},
): Promise<Session> {
  const context = await browser.newContext({
    ...viewports[vp],
    ...extra,
    ...(email
      ? { extraHTTPHeaders: { "Cf-Access-Jwt-Assertion": await identityToken(email) } }
      : {}),
  });
  // Harness limit: tests/e2e/server.ts serves HTML without the viewport meta tag that the
  // production framework emits by default (vinext DEFAULT_VIEWPORT). Without it an emulated
  // phone lays out at 980px, so add the production default for touch-device contexts.
  if ("isMobile" in viewports[vp])
    await context.addInitScript(() => {
      const add = () => {
        if (document.querySelector('meta[name="viewport"]')) return;
        const meta = document.createElement("meta");
        meta.name = "viewport";
        meta.content = "width=device-width, initial-scale=1";
        document.head.appendChild(meta);
      };
      if (document.head) add();
      else document.addEventListener("DOMContentLoaded", add);
    });
  return { context, page: await context.newPage() };
}
async function getView(context: BrowserContext) {
  const response = await context.request.get("/api/membership");
  return { status: response.status(), body: (await response.json()) as ApiView };
}
async function post(context: BrowserContext, command: Record<string, unknown>, revision?: number) {
  const current = revision ?? (await getView(context)).body.revision;
  const response = await context.request.post("/api/membership", {
    headers: { origin },
    data: { revision: current, command },
  });
  return { status: response.status(), body: (await response.json()) as ApiView };
}
const join_ = (context: BrowserContext) => post(context, { type: "join" });
async function owner(browser: Browser, vp: ViewportName = "desktop") {
  const session = await signed(browser, "owner@example.test", vp);
  const joined = await join_(session.context);
  if (joined.status !== 200) throw new Error(`owner join failed: ${joined.status}`);
  if (!joined.body.me?.name)
    await post(session.context, {
      type: "profile.update",
      name: "Olivia Owner",
      title: "Managing partner",
    });
  return session;
}
async function updateMember(
  ownerContext: BrowserContext,
  email: string,
  patch: Partial<{
    status: string;
    levelId: string | null;
    allow: string[];
    deny: string[];
    owner: boolean;
  }>,
) {
  const { body } = await getView(ownerContext);
  const member = body.members?.find((item) => item.email === email);
  if (!member) throw new Error(`member not found: ${email}`);
  const result = await post(
    ownerContext,
    {
      type: "member.update",
      id: member.id,
      status: member.status,
      levelId: member.levelId ?? null,
      allow: member.allow ?? [],
      deny: member.deny ?? [],
      owner: member.owner ?? false,
      ...patch,
    },
    body.revision,
  );
  if (result.status !== 200) throw new Error(`update ${email} failed: ${result.body.error}`);
  return member.id;
}
async function activeMember(
  browser: Browser,
  ownerContext: BrowserContext,
  email: string,
  name: string,
  levelId = "member",
  vp: ViewportName = "desktop",
) {
  const session = await signed(browser, email, vp);
  await join_(session.context);
  await post(session.context, { type: "profile.update", name, title: "Consultant" });
  await updateMember(ownerContext, email, { status: "active", levelId });
  return session;
}
async function saveLevel(ownerContext: BrowserContext, name: string, permissions: string[]) {
  const result = await post(ownerContext, { type: "level.save", name, permissions });
  const level = result.body.levels?.find((item) => item.name === name);
  if (!level) throw new Error(`level not saved: ${name} ${result.body.error}`);
  return level.id;
}
async function closeAll(...sessions: Session[]) {
  await Promise.allSettled(sessions.map((session) => session.context.close()));
}
async function accountLoaded(page: Page) {
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.getByText("Loading your account…")).toHaveCount(0);
}
// A widened (overflowing) phone page is zoomed out by the browser, which can make pointer
// actionability checks hang; fall back to a DOM click and record that it was needed.
async function press(locator: Locator, label: string) {
  try {
    await locator.click({ timeout: 5_000 });
  } catch {
    note(`pointerFallback:${label}`, true);
    await locator.dispatchEvent("click");
  }
}
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- measurement helpers ----------
interface FocusInfo {
  body: boolean;
  tag: string;
  text: string;
  name: string | null;
  outline: string;
  visible: boolean;
  clipped: boolean;
  inViewport: boolean;
  disabled: boolean;
}
async function focusInfo(page: Page): Promise<FocusInfo> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body || element === document.documentElement)
      return {
        body: true,
        tag: "body",
        text: "",
        name: null,
        outline: "",
        visible: false,
        clipped: false,
        inViewport: false,
        disabled: false,
      };
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const width = parseFloat(style.outlineWidth) || 0;
    const extent = width + (parseFloat(style.outlineOffset) || 0);
    let clipped = false;
    for (
      let parent = element.parentElement;
      parent && parent !== document.body && parent !== document.documentElement;
      parent = parent.parentElement
    ) {
      const parentStyle = getComputedStyle(parent);
      if (parentStyle.overflowX !== "visible" || parentStyle.overflowY !== "visible") {
        const box = parent.getBoundingClientRect();
        clipped =
          rect.top - extent < box.top - 0.5 ||
          rect.left - extent < box.left - 0.5 ||
          rect.bottom + extent > box.bottom + 0.5 ||
          rect.right + extent > box.right + 0.5;
        break;
      }
    }
    return {
      body: false,
      tag: element.tagName.toLowerCase(),
      text: (element.getAttribute("aria-label") ?? element.innerText ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 60),
      name: element.getAttribute("name"),
      outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
      visible: style.outlineStyle !== "none" && width >= 2,
      clipped,
      inViewport:
        rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
      disabled: (element as HTMLButtonElement).disabled === true,
    };
  });
}
const focusLog: FocusInfo[] = [];
async function tabTo(
  page: Page,
  match: (focus: FocusInfo) => boolean,
  label: string,
  key = "Tab",
  max = 80,
) {
  const trail: FocusInfo[] = [];
  for (let index = 0; index < max; index++) {
    await page.keyboard.press(key);
    const focus = await focusInfo(page);
    trail.push(focus);
    focusLog.push(focus);
    if (match(focus)) return trail;
  }
  throw new Error(
    `Keyboard focus never reached ${label}: ${trail.map((item) => item.text || item.tag).join(" > ")}`,
  );
}
const named = (text: string) => (focus: FocusInfo) => focus.text === text;

async function axe(page: Page, state: string) {
  const result = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  const practice = await new AxeBuilder({ page }).withTags(["best-practice"]).analyze();
  const nodes = (items: typeof result.violations) =>
    items.map((item) => ({
      id: item.id,
      impact: item.impact,
      targets: item.nodes.map((node) => node.target.map((part) => String(part)).join(" ")),
    }));
  const summary = {
    violations: nodes(result.violations),
    incomplete: result.incomplete.map((item) => item.id),
    bestPractice: nodes(practice.violations),
  };
  note(`axe:${state}`, summary);
  expect.soft(summary.violations, `axe WCAG 2.0-2.2 A/AA violations: ${state}`).toEqual([]);
  return summary;
}
async function structure(page: Page) {
  return page.evaluate(() => {
    const shown = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
    };
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
      .filter(shown)
      .map((heading) => ({
        level: Number(heading.tagName[1]),
        text: (heading.textContent ?? "").trim().slice(0, 50),
      }));
    return {
      h1: headings.filter((heading) => heading.level === 1).map((heading) => heading.text),
      headingSkips: headings.flatMap((heading, index) =>
        index > 0 && heading.level > headings[index - 1].level + 1
          ? [
              `h${headings[index - 1].level} "${headings[index - 1].text}" -> h${heading.level} "${heading.text}"`,
            ]
          : [],
      ),
      banner: document.querySelectorAll("header").length,
      main: document.querySelectorAll("main#main").length,
      contentinfo: document.querySelectorAll("footer").length,
      navs: [...document.querySelectorAll("nav")].map((nav) => nav.getAttribute("aria-label")),
      skipLink: Boolean(document.querySelector('a.skip-link[href="#main"]')),
      lang: document.documentElement.lang,
    };
  });
}
async function layout(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const describe = (element: Element) => {
      const text =
        element.getAttribute("aria-label") ||
        element.getAttribute("name") ||
        (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 32);
      const kind = typeof element.className === "string" ? element.className.split(" ")[0] : "";
      return `${element.tagName.toLowerCase()}${kind ? "." + kind : ""}[${text}]`;
    };
    const scroller = (element: Element) => {
      for (
        let parent = element.parentElement;
        parent && parent !== document.body;
        parent = parent.parentElement
      )
        if (/(auto|scroll)/.test(getComputedStyle(parent).overflowX)) return parent;
      return null;
    };
    const shown = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        !element.closest(".skip-link, .sr-only")
      );
    };
    const controls = [
      ...document.querySelectorAll("a[href],button,input,select,textarea,summary"),
    ].filter(shown);
    const target = (element: Element) =>
      element instanceof HTMLInputElement && element.type === "checkbox"
        ? (element.closest("label") ?? element)
        : element;
    const sizes = controls.map((element) => ({
      element,
      rect: target(element).getBoundingClientRect(),
      inline: element.tagName === "A" && Boolean(element.closest("p, li")),
    }));
    const overlaps: string[] = [];
    for (let i = 0; i < sizes.length; i++)
      for (let j = i + 1; j < sizes.length; j++) {
        const [a, b] = [sizes[i], sizes[j]];
        if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
        const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (x > 1 && y > 1) overlaps.push(`${describe(a.element)} / ${describe(b.element)}`);
      }
    const size = ({ element, rect }: (typeof sizes)[number]) =>
      `${describe(element)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
    return {
      viewport: `${width}x${innerHeight}`,
      scrollWidth: document.documentElement.scrollWidth,
      horizontalScroll: document.documentElement.scrollWidth > width,
      overflowing: [...document.body.querySelectorAll("*")]
        .filter(
          (element) =>
            shown(element) &&
            !scroller(element) &&
            element.getBoundingClientRect().right > width + 1,
        )
        .map(describe)
        .slice(0, 10),
      // Text that spills out of a fixed-width box (the box itself stays inside the viewport).
      textOverflow: [...document.body.querySelectorAll("*")]
        .filter((element) => {
          if (!shown(element) || scroller(element) || element.clientWidth === 0) return false;
          if (getComputedStyle(element).overflowX !== "visible") return false;
          const left = element.getBoundingClientRect().left;
          return (
            element.scrollWidth > element.clientWidth + 1 && left + element.scrollWidth > width + 1
          );
        })
        .map(describe)
        .slice(0, 10),
      clipped: controls
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return !scroller(element) && (rect.left < -1 || rect.right > width + 1);
        })
        .map(describe),
      overlaps,
      under24: sizes
        .filter((item) => !item.inline && (item.rect.height < 24 || item.rect.width < 24))
        .map(size),
      under44: sizes.filter((item) => !item.inline && item.rect.height < 44).map(size),
    };
  });
}
async function shot(page: Page, name: string, fullPage = true) {
  await page.screenshot({ path: join(shotDir, `${name}.png`), fullPage });
}
async function capture(page: Page, state: string, vp: ViewportName) {
  const key = `${state}@${vp}`;
  const measured = await layout(page);
  const shape = await structure(page);
  note(`layout:${key}`, measured);
  note(`structure:${key}`, shape);
  expect.soft(measured.horizontalScroll, `${key}: page scrolls sideways`).toBe(false);
  expect.soft(measured.clipped, `${key}: controls outside the viewport`).toEqual([]);
  expect.soft(measured.overlaps, `${key}: overlapping controls`).toEqual([]);
  // under24/under44 are recorded only: axe target-size applies the WCAG 2.5.8 spacing exception.
  expect.soft(shape.h1.length, `${key}: exactly one h1`).toBe(1);
  expect.soft(shape.main, `${key}: main#main landmark`).toBe(1);
  await axe(page, key);
  await shot(page, `${vp}-${state}`);
}
async function alertText(page: Page) {
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  return (await alert.innerText()).replace("Reload latest changes", "").trim();
}
async function submitForAlert(page: Page, button: Locator) {
  const response = page.waitForResponse(
    (item) => membershipApi.test(item.url()) && item.request().method() === "POST",
  );
  await button.click();
  await response;
  return alertText(page);
}
async function alertPlacement(page: Page) {
  return page.getByRole("alert").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: Math.round(rect.top),
      inViewport: rect.bottom > 0 && rect.top < innerHeight,
      scrollY: Math.round(scrollY),
    };
  });
}
const plainLanguage = /expected|>=|<=|string|token|JSON|fetch|TypeError|Unexpected/i;

// ---------- C1 ----------
test("C1 consultant onboarding, pending limits, owner approval and profile persistence", async ({
  browser,
}) => {
  const admin = await owner(browser);
  const consultant = await signed(browser, "c1-consultant@example.test");
  try {
    const page = consultant.page;
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Create your member profile" })).toBeVisible();
    note("onboarding.copy", await page.locator(".sign-in-card").innerText());
    await capture(page, "onboarding", "desktop");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Profile created.");
    await expect(page.getByText("Pending approval", { exact: true })).toBeVisible();
    note("pending.focusAfterContinue", await focusInfo(page));
    note("pending.tabs", await page.locator("nav.account-tabs button").allInnerTexts());
    note("pending.notices", await page.locator(".notice").allInnerTexts());
    note("pending.role", await page.getByLabel("Your organization role").innerText());
    await capture(page, "pending-profile", "desktop");

    await page.getByLabel("Name", { exact: true }).fill("Casey Consultant");
    await page.getByLabel("Job title").fill("Analyst");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status")).toHaveText("Changes saved.");
    note("pending.focusAfterProfileSave", await focusInfo(page));

    const history = await consultant.context.request.get("/api/membership?view=history");
    const pendingView = (await getView(consultant.context)).body;
    const add = await post(consultant.context, {
      type: "member.add",
      email: "c1-escalation@example.test",
      name: "Escalation",
      levelId: "member",
    });
    const level = await post(consultant.context, {
      type: "level.save",
      name: "Pending escalation",
      permissions: ["members.manage"],
    });
    note("pending.api", {
      history: history.status(),
      members: pendingView.members?.length,
      permissions: pendingView.permissions,
      add: [add.status, add.body.error],
      level: [level.status, level.body.error],
    });
    expect(history.status()).toBe(403);
    expect(add.status).toBe(403);
    expect(level.status).toBe(403);
    expect(pendingView.members).toEqual([]);

    await page.getByRole("link", { name: "Applications", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Applications", level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    note("launcher.pending", {
      main: await page.locator("main").innerText(),
      accountNav: await page.locator(".account-nav").innerText(),
    });
    await capture(page, "launcher-pending", "desktop");

    const adminPage = admin.page;
    await adminPage.goto("/account");
    await accountLoaded(adminPage);
    await adminPage.getByRole("button", { name: "Members", exact: true }).click();
    await adminPage
      .getByRole("button", { name: /Casey Consultant c1-consultant@example\.test/ })
      .click();
    await adminPage.getByRole("combobox", { name: /^Status/ }).selectOption("active");
    await adminPage.getByRole("combobox", { name: /^Base access level/ }).selectOption("member");
    await capture(adminPage, "owner-member-editor", "desktop");
    await adminPage.getByRole("button", { name: "Save access", exact: true }).click();
    await expect(adminPage.getByRole("status")).toHaveText("Changes saved.");
    note("owner.focusAfterSaveAccess", await focusInfo(adminPage));

    await page.goto("/account");
    await accountLoaded(page);
    await expect(page.locator(".profile-summary .status-badge")).toHaveText("active");
    await expect(page.getByLabel("Your organization role")).toHaveText("Member");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Casey Consultant");
    await page.getByLabel("Job title").fill("Senior analyst");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status")).toHaveText("Changes saved.");
    await page.reload();
    await accountLoaded(page);
    await expect(page.getByLabel("Job title")).toHaveValue("Senior analyst");
    await page.getByRole("button", { name: "Members", exact: true }).click();
    note("active.directory", await page.locator(".member-list").innerText());
    await capture(page, "member-directory", "desktop");
    await page.getByRole("button", { name: "My profile", exact: true }).click();
    const signOut = page.getByRole("link", { name: "Sign out" });
    note("signOut", { count: await signOut.count(), href: await signOut.getAttribute("href") });
    await page.goto("/");
    note("launcher.signOutPresent", await page.getByRole("link", { name: "Sign out" }).count());
  } finally {
    await closeAll(admin, consultant);
  }
});

// ---------- C2 ----------
test("C2 administrator adds a member, invitee signs in, custom level, allow and revoke, activity", async ({
  browser,
}) => {
  const admin = await owner(browser);
  const invitee = await signed(browser, "c2-invitee@example.test");
  try {
    const page = admin.page;
    await page.goto("/account");
    await accountLoaded(page);
    await page.getByRole("button", { name: "Members", exact: true }).click();
    await page.getByRole("button", { name: "Add member", exact: true }).click();
    const form = page.locator("form", { has: page.getByRole("group", { name: "Add member" }) });
    await form.getByLabel("Name").fill("Invited Ines");
    await form.getByLabel("Email").fill("c2-invitee@example.test");
    await form.getByLabel("Base access level").selectOption("member");
    await capture(page, "add-member-form", "desktop");
    await form.getByRole("button", { name: "Add member" }).click();
    await expect(page.getByRole("status")).toHaveText("Changes saved.");
    note("add.after", {
      focus: await focusInfo(page),
      panel: await page.locator(".management-grid > :nth-child(2)").innerText(),
    });
    await expect(page.getByRole("button", { name: /Invited Ines c2-invitee/ })).toContainText(
      "invited",
    );

    await invitee.page.goto("/account");
    await expect(invitee.page.getByRole("button", { name: "Continue" })).toBeVisible();
    note("invitee.onboardingCopy", await invitee.page.locator(".sign-in-card").innerText());
    await invitee.page.getByRole("button", { name: "Continue" }).click();
    await expect(invitee.page.getByLabel("Your organization role")).toHaveText("Member");
    note(
      "invitee.status",
      await invitee.page.locator(".profile-summary .status-badge").innerText(),
    );

    await page.getByRole("button", { name: "Access levels", exact: true }).click();
    await page.getByRole("button", { name: "Create access level", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Delivery lead");
    await page.getByLabel("View member directory", { exact: true }).check();
    await page.getByLabel("View access history", { exact: true }).check();
    await capture(page, "level-editor", "desktop");
    // The invitee's sign-in above bumped the organization-wide revision after this page loaded.
    const createLevel = page.getByRole("button", { name: "Create access level", exact: true });
    const firstAttempt = page.waitForResponse(
      (item) => membershipApi.test(item.url()) && item.request().method() === "POST",
    );
    await createLevel.last().click();
    const firstStatus = (await firstAttempt).status();
    note("level.firstAttemptAfterInviteeSignIn", {
      status: firstStatus,
      message: firstStatus === 200 ? "Changes saved." : await alertText(page),
    });
    if (firstStatus !== 200) {
      await page.getByRole("button", { name: "Reload latest changes" }).click();
      await accountLoaded(page);
      note("level.formAfterReload", await page.getByLabel("Name", { exact: true }).inputValue());
      await page.getByLabel("Name", { exact: true }).fill("Delivery lead");
      await page.getByLabel("View member directory", { exact: true }).check();
      await page.getByLabel("View access history", { exact: true }).check();
      await createLevel.last().click();
    }
    await expect(page.getByRole("status")).toHaveText("Changes saved.");
    note(
      "level.afterCreatePanel",
      await page.locator(".management-grid > :nth-child(2)").innerText(),
    );
    await page.getByLabel("Name", { exact: true }).fill("delivery LEAD");
    await page.getByRole("button", { name: "Create access level", exact: true }).last().click();
    note("level.duplicateName", await alertText(page));

    await page.getByRole("button", { name: "Members", exact: true }).click();
    await page.getByRole("button", { name: /Invited Ines c2-invitee/ }).click();
    await page
      .getByRole("combobox", { name: /^Base access level/ })
      .selectOption({ label: "Delivery lead" });
    const editor = page.locator("form", { has: page.getByRole("button", { name: "Save access" }) });
    note("editor.ariaSnapshot", await editor.ariaSnapshot());
    const sameName = await editor
      .getByRole("checkbox", { name: "View access history", exact: true })
      .count();
    note("allowRevoke.checkboxesNamedViewAccessHistory", sameName);
    expect
      .soft(sameName, "Allow and Revoke checkboxes need distinguishable accessible names")
      .toBe(1);
    await editor.locator('input[name="allow"][value="members.manage"]').check();
    await editor.locator('input[name="deny"][value="audit.read"]').check();
    await editor.getByRole("button", { name: "Save access", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Changes saved.");
    note("allowRevoke.effective", await page.locator(".effective-access").innerText());
    const inviteeView = (await getView(invitee.context)).body;
    expect(inviteeView.permissions).toEqual(["members.manage", "members.read"]);
    expect((await invitee.context.request.get("/api/membership?view=history")).status()).toBe(403);
    await invitee.page.reload();
    await accountLoaded(invitee.page);
    note(
      "allowRevoke.inviteeTabs",
      await invitee.page.locator("nav.account-tabs button").allInnerTexts(),
    );
    await updateMember(admin.context, "c2-invitee@example.test", { allow: [], deny: [] });
    const unnamed = await signed(browser, "c2-unnamed-pending@example.test");
    await join_(unnamed.context);
    await unnamed.context.close();

    await page.reload();
    await accountLoaded(page);
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();
    await expect(page.getByText("Loading activity…")).toHaveCount(0);
    const entries = await page.locator(".activity-list li").evaluateAll((items) =>
      items.map((item) => ({
        action: item.querySelector("strong")?.textContent ?? "",
        line: (item.querySelector("p.field-note")?.textContent ?? "").replace(/\s+/g, " "),
      })),
    );
    note("activity.entries", entries.slice(0, 20));
    const visible = await page.locator(".activity-list ol").innerText();
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/;
    note("activity.visibleUuid", uuid.test(visible));
    const blank = entries.filter((entry) => /^By\s+·|·\s*$/.test(entry.line.trim()));
    note("activity.blankNames", blank);
    expect.soft(blank, "activity names an actor and target on every entry").toEqual([]);
    expect.soft(uuid.test(visible), "activity shows no raw database IDs").toBe(false);
    await page.locator(".activity-list summary").first().click();
    const detail = JSON.parse(await page.locator(".activity-list pre").first().innerText()) as {
      before: unknown;
      after: Record<string, unknown> | null;
    };
    note("activity.detailKeys", detail.after ? Object.keys(detail.after) : null);
    await capture(page, "activity", "desktop");
  } finally {
    await closeAll(admin, invitee);
  }
});

// ---------- C3 ----------
test("C3 invalid input and duplicate records as users see them", async ({ browser }) => {
  const admin = await owner(browser);
  const phone = await owner(browser, "mobile");
  try {
    const page = admin.page;
    await page.goto("/account");
    await accountLoaded(page);
    const name = page.getByLabel("Name", { exact: true });
    await name.fill("   ");
    await page.getByRole("button", { name: "Save profile" }).click();
    const whitespace = await alertText(page);
    note("profile.whitespaceName", whitespace);
    expect.soft(whitespace, "profile name error is plain language").not.toMatch(plainLanguage);
    note(
      "profile.fieldAssociation",
      await name.evaluate((input) => ({
        invalid: input.getAttribute("aria-invalid"),
        describedBy: input.getAttribute("aria-describedby"),
      })),
    );
    await name.fill("N".repeat(120));
    note("profile.overlongNameLength", (await name.inputValue()).length);
    await page.getByLabel("Job title").fill("T".repeat(150));
    note("profile.overlongTitleLength", (await page.getByLabel("Job title").inputValue()).length);
    const tooLong = await post(admin.context, {
      type: "profile.update",
      name: "N".repeat(81),
      title: "",
    });
    note("api.overlongName", [tooLong.status, tooLong.body.error]);

    await page.reload();
    await accountLoaded(page);
    await page.getByRole("button", { name: "Members", exact: true }).click();
    await page.getByRole("button", { name: "Add member", exact: true }).click();
    const form = page.locator("form", { has: page.getByRole("group", { name: "Add member" }) });
    const email = form.getByLabel("Email");
    await form.getByLabel("Name").fill("Bad Email");
    await email.fill("not-an-email");
    await form.getByLabel("Base access level").selectOption("member");
    await form.getByRole("button", { name: "Add member" }).click();
    const native = await email.evaluate((input: HTMLInputElement) => ({
      valid: input.validity.valid,
      message: input.validationMessage,
    }));
    note("add.invalidEmail.native", native);
    expect(native.valid).toBe(false);
    await expect(page.getByRole("alert")).toHaveCount(0);

    await email.fill("someone@localhost");
    const serverEmail = await submitForAlert(
      page,
      form.getByRole("button", { name: "Add member" }),
    );
    note("add.invalidEmail.server", serverEmail);
    expect.soft(serverEmail, "server email error is plain language").not.toMatch(plainLanguage);

    await form.getByLabel("Name").fill("  ");
    await email.fill("c3-blank-name@example.test");
    const blankName = await submitForAlert(page, form.getByRole("button", { name: "Add member" }));
    note("add.blankName", blankName);
    expect.soft(blankName, "blank name error is plain language").not.toMatch(plainLanguage);

    await form.getByLabel("Name").fill("Duplicate Owner");
    await email.fill("OWNER@example.test");
    note(
      "add.duplicateEmail",
      await submitForAlert(page, form.getByRole("button", { name: "Add member" })),
    );
    note("add.duplicateEmail.focus", await focusInfo(page));
    note("add.duplicateEmail.formKept", await email.inputValue());
    await capture(page, "add-member-duplicate-error", "desktop");

    const mobile = phone.page;
    await mobile.goto("/account");
    await accountLoaded(mobile);
    await mobile.getByRole("button", { name: "Members", exact: true }).click();
    await mobile.getByRole("button", { name: "Add member", exact: true }).click();
    const mobileForm = mobile.locator("form", {
      has: mobile.getByRole("group", { name: "Add member" }),
    });
    await mobileForm.getByLabel("Name").fill("Duplicate Owner");
    await mobileForm.getByLabel("Email").fill("owner@example.test");
    await mobileForm.getByLabel("Base access level").selectOption("member");
    await mobileForm.getByRole("button", { name: "Add member" }).tap();
    await expect(mobile.getByRole("alert")).toBeVisible();
    const placement = await alertPlacement(mobile);
    note("mobile.duplicateEmail.alertPlacement", placement);
    expect
      .soft(placement.inViewport, "mobile: error is visible where the person tapped")
      .toBe(true);
    await shot(mobile, "mobile-add-member-duplicate-error-viewport", false);
    await capture(mobile, "add-member-duplicate-error", "mobile");
  } finally {
    await closeAll(admin, phone);
  }
});

// ---------- C4 ----------
test("C4 stale revision when two pages edit and when unrelated changes land", async ({
  browser,
}) => {
  const admin = await owner(browser);
  const subject = await activeMember(
    browser,
    admin.context,
    "c4-subject@example.test",
    "Stale Subject",
  );
  try {
    const first = admin.page;
    const second = await admin.context.newPage();
    await first.goto("/account");
    await second.goto("/account");
    await accountLoaded(first);
    await accountLoaded(second);
    await first.getByRole("button", { name: "Members", exact: true }).click();
    await first.getByRole("button", { name: /Stale Subject c4-subject/ }).click();
    await first.getByRole("combobox", { name: /^Status/ }).selectOption("suspended");
    await first.getByRole("button", { name: "Save access", exact: true }).click();
    await expect(first.getByRole("status")).toHaveText("Changes saved.");

    await second.getByLabel("Job title").fill("Managing director");
    await second.getByRole("button", { name: "Save profile" }).click();
    const stale = await alertText(second);
    note("stale.message", stale);
    note("stale.typedValueBeforeReload", await second.getByLabel("Job title").inputValue());
    note("stale.focusAfterError", await focusInfo(second));
    await capture(second, "stale-revision-error", "desktop");
    await second.getByRole("button", { name: "Reload latest changes" }).focus();
    await second.keyboard.press("Enter");
    await expect(second.getByRole("alert")).toHaveCount(0);
    await accountLoaded(second);
    note("stale.afterReload", {
      title: await second.getByLabel("Job title").inputValue(),
      focus: await focusInfo(second),
    });

    const member = subject.page;
    await updateMember(admin.context, "c4-subject@example.test", { status: "active" });
    await member.goto("/account");
    await accountLoaded(member);
    await member.getByLabel("Job title").fill("Consultant II");
    await post(admin.context, {
      type: "member.add",
      email: "c4-unrelated@example.test",
      name: "Unrelated Invitee",
      levelId: "member",
    });
    await member.getByRole("button", { name: "Save profile" }).click();
    note("globalRevision.memberConflictAfterUnrelatedInvite", await alertText(member));
  } finally {
    await closeAll(admin, subject);
  }
});

// ---------- C5 ----------
test("C5 delegated administrator meets locked and forbidden actions", async ({ browser }) => {
  const admin = await owner(browser);
  const manager = await saveLevel(admin.context, "Member manager", [
    "members.manage",
    "members.read",
  ]);
  await saveLevel(admin.context, "History auditor", ["audit.read", "members.read"]);
  const delegate = await activeMember(
    browser,
    admin.context,
    "c5-delegate@example.test",
    "Dana Delegate",
    manager,
  );
  const target = await activeMember(
    browser,
    admin.context,
    "c5-target@example.test",
    "Toby Target",
  );
  try {
    const page = delegate.page;
    await page.goto("/account");
    await accountLoaded(page);
    note("delegate.role", await page.getByLabel("Your organization role").innerText());
    note("delegate.tabs", await page.locator("nav.account-tabs button").allInnerTexts());
    await page.getByRole("button", { name: "Members", exact: true }).click();
    await page.getByRole("button", { name: /owner@example\.test/ }).click();
    note("delegate.ownerLocked", {
      notice: await page.locator("form .notice").innerText(),
      saveDisabled: await page.getByRole("button", { name: "Save access" }).isDisabled(),
    });
    await capture(page, "delegate-owner-locked", "desktop");
    await page.getByRole("button", { name: /Toby Target c5-target/ }).click();
    const editor = page.locator("form", { has: page.getByRole("button", { name: "Save access" }) });
    note(
      "delegate.disabledChoices",
      await editor
        .locator('input[type="checkbox"]')
        .evaluateAll((inputs) =>
          inputs
            .filter((input) => (input as HTMLInputElement).disabled)
            .map(
              (input) => `${(input as HTMLInputElement).name}:${(input as HTMLInputElement).value}`,
            ),
        ),
    );
    note(
      "delegate.editorExplainsDisabledChoices",
      /own access|cannot|owner/i.test(
        await editor
          .locator(".permission-list")
          .first()
          .evaluate((element) => element.parentElement?.textContent ?? ""),
      ),
    );
    await editor
      .getByRole("combobox", { name: /^Base access level/ })
      .selectOption({ label: "History auditor" });
    await editor.getByRole("button", { name: "Save access" }).click();
    note("delegate.beyondOwnAccess", await alertText(page));
    await capture(page, "delegate-forbidden-error", "desktop");

    await page.getByRole("button", { name: "Reload latest changes" }).click();
    await accountLoaded(page);
    await page.getByRole("button", { name: /Toby Target c5-target/ }).click();
    await updateMember(admin.context, "c5-delegate@example.test", { deny: ["members.manage"] });
    await page.getByRole("combobox", { name: /^Status/ }).selectOption("suspended");
    await page.getByRole("button", { name: "Save access" }).click();
    note("delegate.revokedWhileOpen", await alertText(page));
    await page.getByRole("button", { name: "Reload latest changes" }).click();
    await accountLoaded(page);
    note("delegate.afterRevokeTabs", await page.locator("nav.account-tabs button").allInnerTexts());
    note(
      "delegate.afterRevokeAddMember",
      await page.getByRole("button", { name: "Add member" }).count(),
    );
    const targetView = (await getView(admin.context)).body.members?.find(
      (item) => item.email === "c5-target@example.test",
    );
    const direct = await post(delegate.context, {
      type: "member.update",
      id: targetView?.id,
      status: "suspended",
      levelId: "member",
      allow: [],
      deny: [],
      owner: false,
    });
    note("delegate.directWriteAfterRevoke", [direct.status, direct.body.error]);
    expect(direct.status).toBe(403);
  } finally {
    await closeAll(admin, delegate, target);
  }
});

// ---------- C6 ----------
test("C6 suspension while the member's session is open", async ({ browser }) => {
  const admin = await owner(browser);
  const member = await activeMember(
    browser,
    admin.context,
    "c6-suspended@example.test",
    "Sam Suspended",
  );
  try {
    const page = member.page;
    await page.goto("/account");
    await accountLoaded(page);
    await page.getByRole("button", { name: "Members", exact: true }).click();
    const before = await page.locator(".member-list").innerText();
    await updateMember(admin.context, "c6-suspended@example.test", { status: "suspended" });
    await page.getByRole("button", { name: "My profile", exact: true }).click();
    await page.getByRole("button", { name: "Members", exact: true }).click();
    note(
      "suspended.cachedDirectoryStillShown",
      (await page.locator(".member-list").innerText()) === before,
    );
    const view = (await getView(member.context)).body;
    note("suspended.apiNow", { permissions: view.permissions, members: view.members?.length });
    expect(view.permissions).toEqual([]);
    expect(view.members).toEqual([]);
    expect((await member.context.request.get("/api/membership?view=history")).status()).toBe(403);

    await page.getByRole("button", { name: "My profile", exact: true }).click();
    await page.getByLabel("Job title").fill("Still here");
    await page.getByRole("button", { name: "Save profile" }).click();
    note("suspended.staleSave", await alertText(page));
    await page.getByRole("button", { name: "Reload latest changes" }).click();
    await expect(
      page.getByText("Your access has been suspended. Contact an organization owner."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Save profile" })).toBeDisabled();
    note("suspended.tabs", await page.locator("nav.account-tabs button").allInnerTexts());
    note("suspended.role", await page.getByLabel("Your organization role").innerText());
    await capture(page, "suspended-profile", "desktop");
    const write = await post(member.context, { type: "profile.update", name: "Sam", title: "" });
    note("suspended.freshWrite", [write.status, write.body.error]);
    expect(write.status).toBe(403);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    note("suspended.launcher", await page.locator("main").innerText());
  } finally {
    await closeAll(admin, member);
  }
});

// ---------- C7 ----------
test("C7 server errors, network failure and expired-session simulations", async ({ browser }) => {
  const admin = await owner(browser);
  try {
    const loads: [string, (route: Route) => Promise<void>][] = [
      [
        "load-500-text",
        (route) =>
          route.fulfill({
            status: 500,
            contentType: "text/plain",
            body: "Synthetic harness error",
          }),
      ],
      [
        "load-500-json",
        (route) =>
          route.fulfill({
            status: 500,
            json: { error: "Membership could not be loaded. Please try again." },
          }),
      ],
      [
        "load-503-json",
        (route) =>
          route.fulfill({ status: 503, json: { error: "Sign-in is not configured yet." } }),
      ],
      ["load-network-abort", (route) => route.abort("failed")],
      [
        "load-session-redirect",
        (route) =>
          route.fulfill({
            status: 302,
            headers: { location: "https://login.example.test/cdn-cgi/access/login" },
          }),
      ],
    ];
    const loadResults: Record<string, unknown> = {};
    for (const [name, handler] of loads) {
      const page = await admin.context.newPage();
      await page.route(membershipApi, handler);
      await page.goto("/account");
      const message = await alertText(page);
      loadResults[name] = {
        message,
        signInCard: await page.getByRole("heading", { name: "Sign in to Slice" }).count(),
        retryControl: await page.getByRole("button", { name: /Reload|Try again|Retry/ }).count(),
      };
      expect.soft(message, `${name}: plain-language error`).not.toMatch(plainLanguage);
      await shot(page, `desktop-${name}`);
      if (name === "load-500-json") await axe(page, "load-500-json@desktop");
      await page.close();
    }
    note("loadErrors", loadResults);

    const saves: [string, (route: Route) => Promise<void>][] = [
      [
        "save-500-json",
        (route) =>
          route.fulfill({
            status: 500,
            json: { error: "Membership could not be loaded. Please try again." },
          }),
      ],
      ["save-network-abort", (route) => route.abort("failed")],
      [
        "save-401-json",
        (route) =>
          route.fulfill({
            status: 401,
            json: { error: "Your sign-in could not be verified. Sign in again." },
          }),
      ],
      [
        "save-session-redirect",
        (route) =>
          route.fulfill({
            status: 302,
            headers: { location: "https://login.example.test/cdn-cgi/access/login" },
          }),
      ],
    ];
    const saveResults: Record<string, unknown> = {};
    for (const [name, handler] of saves) {
      const page = await admin.context.newPage();
      await page.goto("/account");
      await accountLoaded(page);
      await page.route(membershipApi, (route) =>
        route.request().method() === "POST" ? handler(route) : route.continue(),
      );
      await page.getByLabel("Job title").fill(`Edited ${name}`);
      await page.getByRole("button", { name: "Save profile" }).click();
      const message = await alertText(page);
      saveResults[name] = {
        message,
        typedValueKept: (await page.getByLabel("Job title").inputValue()) === `Edited ${name}`,
        signInLink: await page.getByRole("link", { name: /Sign in/ }).count(),
        focus: await focusInfo(page),
      };
      expect.soft(message, `${name}: plain-language error`).not.toMatch(plainLanguage);
      await shot(page, `desktop-${name}`);
      await page.close();
    }
    note("saveErrors", saveResults);

    const expired = await admin.context.newPage();
    await expired.goto("/account");
    await accountLoaded(expired);
    await expired.route(membershipApi, (route) =>
      route.fulfill({
        status: 302,
        headers: { location: "https://login.example.test/cdn-cgi/access/login" },
      }),
    );
    await expired.getByLabel("Job title").fill("Edited while expired");
    await expired.getByRole("button", { name: "Save profile" }).click();
    await alertText(expired);
    await expired.getByRole("button", { name: "Reload latest changes" }).click();
    await expect(expired.getByRole("alert")).toBeVisible();
    note("expiredSession.afterReload", {
      message: await alertText(expired),
      staleWorkspaceStillShown: await expired.getByRole("button", { name: "Save profile" }).count(),
      signInPath: await expired.getByRole("link", { name: /Sign in/ }).count(),
    });
    await shot(expired, "desktop-expired-session-after-reload");
    await expired.close();

    const historyPage = await admin.context.newPage();
    await historyPage.goto("/account");
    await accountLoaded(historyPage);
    await historyPage.route(/\/api\/membership\?view=history$/, (route) =>
      route.fulfill({
        status: 500,
        json: { error: "Membership could not be loaded. Please try again." },
      }),
    );
    await historyPage.getByRole("button", { name: "Activity", exact: true }).click();
    note("historyError", {
      message: await alertText(historyPage),
      emptyStateAlsoShown: await historyPage.getByText("No activity to display.").count(),
    });
    await shot(historyPage, "desktop-history-error");
    // Recovery: the offered "Reload latest changes" reloads membership, not the history list.
    await historyPage.unroute(/\/api\/membership\?view=history$/);
    await historyPage.getByRole("button", { name: "Reload latest changes" }).click();
    await accountLoaded(historyPage);
    const realHistory = await admin.context.request.get("/api/membership?view=history");
    const realEntries = ((await realHistory.json()) as { history: unknown[] }).history.length;
    const falseEmpty = await historyPage.getByText("No activity to display.").count();
    note("historyError.afterReloadLatestChanges", {
      emptyStateShown: falseEmpty,
      alertShown: await historyPage.getByRole("alert").count(),
      actualEntriesOnServer: realEntries,
    });
    expect
      .soft(falseEmpty > 0 && realEntries > 0, "history recovery must not show a false empty log")
      .toBe(false);
    await shot(historyPage, "desktop-history-error-after-reload");
    await historyPage.close();

    const anonymous = await signed(browser, null);
    await anonymous.page.goto("/account");
    note("signedOut", {
      message: await alertText(anonymous.page),
      card: await anonymous.page.getByRole("heading", { name: "Sign in to Slice" }).count(),
    });
    await capture(anonymous.page, "signed-out", "desktop");
    await anonymous.context.close();
  } finally {
    await closeAll(admin);
  }
});

// ---------- C8 ----------
test("C8 keyboard-only onboarding and administrator access change", async ({ browser }) => {
  focusLog.length = 0;
  const admin = await owner(browser);
  const person = await signed(browser, "c8-keyboard@example.test");
  try {
    const page = person.page;
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Create your member profile" })).toBeVisible();
    await page.keyboard.press("Tab");
    const skip = await focusInfo(page);
    note("kb.firstTab", skip);
    expect.soft(skip.text, "first Tab reaches the skip link").toBe("Skip to content");
    expect.soft(skip.inViewport, "skip link becomes visible on focus").toBe(true);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    note("kb.afterSkipLink", await focusInfo(page));
    const onboarding =
      (await focusInfo(page)).text === "Continue"
        ? []
        : await tabTo(page, named("Continue"), "Continue");
    note(
      "kb.onboardingTrail",
      onboarding.map((item) => item.text || item.tag),
    );
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Profile created.");
    const afterContinue = await focusInfo(page);
    note("kb.focusAfterContinue", afterContinue);
    expect
      .soft(afterContinue.body, "focus is placed deliberately after creating the profile")
      .toBe(false);
    const profileTrail = await tabTo(page, (focus) => focus.name === "name", "Name field");
    note(
      "kb.trailToName",
      profileTrail.map((item) => item.text || item.name || item.tag),
    );
    await page.keyboard.type("Kim Keyboard");
    await page.keyboard.press("Tab");
    await page.keyboard.type("Analyst");
    await tabTo(page, named("Save profile"), "Save profile");
    await page.keyboard.press("Space");
    await expect(page.getByRole("status")).toHaveText("Changes saved.");
    const afterSave = await focusInfo(page);
    note("kb.focusAfterProfileSave", afterSave);
    expect.soft(afterSave.body, "focus survives saving the profile").toBe(false);
    await page.keyboard.press("Tab");
    note("kb.nextTabAfterProfileSave", await focusInfo(page));
    await page.reload();
    await accountLoaded(page);
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Kim Keyboard");
    await page.getByLabel("Name", { exact: true }).focus();
    await page.keyboard.press("End");
    await page.keyboard.type(" K");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Changes saved.");
    note("kb.enterSubmitsProfile", await page.getByLabel("Name", { exact: true }).inputValue());

    const adminPage = admin.page;
    await adminPage.goto("/account");
    await accountLoaded(adminPage);
    const toMembers = await tabTo(adminPage, named("Members"), "Members tab");
    note(
      "kb.adminTrailToMembers",
      toMembers.map((item) => item.text || item.tag),
    );
    note("kb.membersTabFocus", toMembers.at(-1));
    await shot(adminPage, "desktop-keyboard-focus-members-tab", false);
    await adminPage.keyboard.press("Enter");
    await expect(adminPage.getByRole("searchbox", { name: "Search members" })).toBeVisible();
    await tabTo(
      adminPage,
      (focus) => focus.text === "Search members" || focus.tag === "input",
      "search",
    );
    await adminPage.keyboard.type("c8-keyboard");
    const toRow = await tabTo(
      adminPage,
      (focus) => focus.text.includes("c8-keyboard@example.test"),
      "member row",
    );
    note(
      "kb.trailToRow",
      toRow.map((item) => item.text || item.tag),
    );
    await adminPage.keyboard.press("Space");
    await expect(adminPage.getByRole("button", { name: /c8-keyboard/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const toStatus = await tabTo(adminPage, (focus) => focus.name === "status", "Status select");
    note("kb.tabsFromRowToStatus", toStatus.length);
    await adminPage.keyboard.type("a");
    let status = await adminPage.getByRole("combobox", { name: /^Status/ }).inputValue();
    if (status !== "active") {
      await adminPage.keyboard.press("ArrowDown");
      status = await adminPage.getByRole("combobox", { name: /^Status/ }).inputValue();
    }
    note("kb.statusChangedWithKeyboard", status);
    expect(status).toBe("active");
    await tabTo(adminPage, (focus) => focus.name === "levelId", "Base access level");
    await adminPage.keyboard.type("Member");
    const levelValue = await adminPage
      .getByRole("combobox", { name: /^Base access level/ })
      .inputValue();
    note("kb.levelChangedWithKeyboard", levelValue);
    expect(levelValue).toBe("member");
    await tabTo(adminPage, (focus) => focus.name === "allow", "first Allow checkbox");
    await adminPage.keyboard.press("Space");
    const toggled = await adminPage.locator('input[name="allow"]').first().isChecked();
    await adminPage.keyboard.press("Space");
    note("kb.checkboxSpaceToggles", toggled);
    await adminPage.keyboard.press("Escape");
    note("kb.escapeInEditor", {
      editorStillOpen: await adminPage.getByRole("button", { name: "Save access" }).count(),
      focus: await focusInfo(adminPage),
    });
    const toSave = await tabTo(adminPage, named("Save access"), "Save access");
    note("kb.tabsToSaveAccess", toSave.length);
    await adminPage.keyboard.press("Enter");
    await expect(adminPage.getByRole("status")).toHaveText("Changes saved.");
    const afterAccess = await focusInfo(adminPage);
    note("kb.focusAfterSaveAccess", afterAccess);
    expect.soft(afterAccess.body, "focus survives saving access").toBe(false);
    await adminPage.keyboard.press("Tab");
    note("kb.nextTabAfterSaveAccess", await focusInfo(adminPage));
    expect((await getView(person.context)).body.me?.status).toBe("active");

    await adminPage.keyboard.press("Shift+Tab");
    const toActivity = await tabTo(adminPage, named("Activity"), "Activity tab", "Shift+Tab");
    note("kb.shiftTabTrailToActivity", toActivity.length);
    await adminPage.keyboard.press("Enter");
    await expect(adminPage.getByRole("heading", { name: "Recent activity" })).toBeVisible();
    await expect(adminPage.getByText("Loading activity…")).toHaveCount(0);
    const afterActivity = await focusInfo(adminPage);
    note("kb.focusAfterActivityTab", afterActivity);
    expect.soft(afterActivity.body, "focus stays on the Activity tab after it loads").toBe(false);

    await adminPage.getByRole("button", { name: "My profile", exact: true }).focus();
    let escaped = false;
    for (let index = 0; index < 120 && !escaped; index++) {
      await adminPage.keyboard.press("Tab");
      escaped = (await focusInfo(adminPage)).body;
    }
    note("kb.tabLeavesPage", escaped);
    expect.soft(escaped, "no keyboard trap: Tab eventually leaves the page").toBe(true);

    const invisible = focusLog.filter((focus) => !focus.body && (!focus.visible || focus.clipped));
    const unique = [
      ...new Map(invisible.map((focus) => [`${focus.tag}:${focus.text}`, focus])).values(),
    ];
    note("kb.focusIndicatorProblems", unique);
    expect
      .soft(
        unique.map((focus) => `${focus.tag}:${focus.text}`),
        "focus indicator is visible and unclipped",
      )
      .toEqual([]);
    note("kb.focusStops", focusLog.length);
  } finally {
    await closeAll(admin, person);
  }
});

// ---------- C9 ----------
test("C9 layout and accessibility matrix at desktop, mobile, 200% zoom and 320px reflow", async ({
  browser,
}) => {
  test.setTimeout(480_000);
  const admin = await owner(browser);
  const longName = "Maximiliana" + "Synthetic".repeat(8) + "Consultant";
  const longEmail = `${"long-synthetic-consultant-address".padEnd(60, "x")}@example.test`;
  const fixtures = [
    await activeMember(browser, admin.context, longEmail, longName.slice(0, 80)),
    await activeMember(browser, admin.context, "c9-suspended@example.test", "Sky Suspended"),
  ];
  await updateMember(admin.context, "c9-suspended@example.test", { status: "suspended" });
  const pending = await signed(browser, "c9-pending@example.test");
  await join_(pending.context);
  fixtures.push(pending);
  // Realistic case: a new sign-in has no name yet, so the editor heading shows the email.
  const realisticEmail = "alexandria.konstantinopoulou-whitfield@example.test";
  const unnamed = await signed(browser, realisticEmail);
  await join_(unnamed.context);
  fixtures.push(unnamed);
  note("fixtures", {
    longNameLength: longName.slice(0, 80).length,
    longEmailLength: longEmail.length,
  });
  try {
    for (const vp of Object.keys(viewports) as ViewportName[]) {
      const sessions: Session[] = [];
      const open = async (email: string | null) => {
        const session = await signed(browser, email, vp);
        sessions.push(session);
        return session.page;
      };
      try {
        const page = await open("owner@example.test");
        await page.goto("/");
        await page.waitForLoadState("networkidle");
        await capture(page, "launcher-owner", vp);
        await page.goto("/connect-ai");
        await capture(page, "connect-ai", vp);
        await page.goto("/account");
        await accountLoaded(page);
        await capture(page, "account-owner-profile", vp);
        await page.getByRole("button", { name: "Members", exact: true }).click();
        await capture(page, "members-list", vp);
        await press(
          page.getByRole("button", { name: new RegExp(escapeRegex(realisticEmail)) }),
          `unnamed@${vp}`,
        );
        await capture(page, "member-editor-unnamed-long-email", vp);
        await press(page.getByRole("button", { name: "Add member", exact: true }), `add@${vp}`);
        await capture(page, "add-member", vp);
        await press(
          page.getByRole("button", { name: "Access levels", exact: true }),
          `levels@${vp}`,
        );
        await press(page.locator(".member-list button.member-row").first(), `level@${vp}`);
        await capture(page, "level-editor", vp);
        await press(page.getByRole("button", { name: "Members", exact: true }), `members@${vp}`);
        await press(
          page.getByRole("button", { name: new RegExp(escapeRegex(longEmail)) }),
          `long@${vp}`,
        );
        await capture(page, "member-editor-long-name", vp);
        await press(page.getByRole("button", { name: "Activity", exact: true }), `activity@${vp}`);
        await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();
        await expect(page.getByText("Loading activity…")).toHaveCount(0);
        if (vp === "desktop") {
          const lines = await page.locator(".activity-list li p.field-note").allInnerTexts();
          note(
            "activity.blankNameLines",
            lines.filter((line) => /^By\s+·|·\s*$/.test(line.trim())),
          );
          note("activity.actions", [
            ...new Set(await page.locator(".activity-list li strong").allInnerTexts()),
          ]);
        }
        await press(page.locator(".activity-list summary").first(), `details@${vp}`);
        await capture(page, "activity-expanded", vp);

        const failing = await open("owner@example.test");
        await failing.route(membershipApi, (route) =>
          route.fulfill({
            status: 500,
            json: { error: "Membership could not be loaded. Please try again." },
          }),
        );
        await failing.goto("/account");
        await expect(failing.getByRole("alert")).toBeVisible();
        await capture(failing, "load-error", vp);

        const long = await open(longEmail);
        await long.goto("/account");
        await accountLoaded(long);
        await capture(long, "long-name-profile", vp);
        await long.goto("/");
        await long.waitForLoadState("networkidle");
        await capture(long, "launcher-long-name", vp);

        const fresh = await open(`c9-new-${vp}@example.test`);
        await fresh.goto("/account");
        await expect(fresh.getByRole("button", { name: "Continue" })).toBeVisible();
        await capture(fresh, "onboarding", vp);

        const waiting = await open("c9-pending@example.test");
        await waiting.goto("/account");
        await accountLoaded(waiting);
        await capture(waiting, "pending-profile", vp);

        const suspended = await open("c9-suspended@example.test");
        await suspended.goto("/account");
        await accountLoaded(suspended);
        await capture(suspended, "suspended-profile", vp);

        const anonymous = await open(null);
        await anonymous.goto("/account");
        await expect(anonymous.getByRole("heading", { name: "Sign in to Slice" })).toBeVisible();
        await capture(anonymous, "signed-out", vp);
      } finally {
        await closeAll(...sessions);
      }
    }
  } finally {
    await closeAll(admin, ...fixtures);
  }
});

// ---------- C10 ----------
test("C10 reduced motion, non-text contrast and page titles", async ({ browser }) => {
  const session = await signed(browser, "owner@example.test", "desktop", {
    reducedMotion: "reduce",
  });
  try {
    const page = session.page;
    const results: Record<string, unknown> = {};
    for (const path of ["/", "/account", "/connect-ai"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      if (path === "/account") {
        await accountLoaded(page);
        await page.getByRole("button", { name: "Members", exact: true }).click();
        await page.getByRole("button", { name: "Add member", exact: true }).click();
      }
      results[path] = await page.evaluate(() => {
        const parse = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const channel = (value: number) => {
          const v = value / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        const luminance = ([r, g, b]: number[]) =>
          0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
        const ratio = (a: string, b: string) => {
          const [high, low] = [luminance(parse(a)), luminance(parse(b))].sort((x, y) => y - x);
          return Math.round(((high + 0.05) / (low + 0.05)) * 100) / 100;
        };
        const background = (element: Element | null) => {
          for (let node = element; node; node = node.parentElement) {
            const color = getComputedStyle(node).backgroundColor;
            if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
          }
          return getComputedStyle(document.documentElement).backgroundColor;
        };
        const transitions = [...document.querySelectorAll("*")]
          .map((element) => getComputedStyle(element))
          .filter((style) =>
            style.transitionDuration.split(",").some((value) => parseFloat(value) > 0),
          )
          .map((style) => `${style.transitionProperty}:${style.transitionDuration}`);
        return {
          title: document.title,
          animations: document.getAnimations().length,
          transitions: [...new Set(transitions)],
          controlBorders: [
            ...document.querySelectorAll("input:not([type=checkbox]), select, textarea"),
          ].map((element) => {
            const border = getComputedStyle(element).borderTopColor;
            const around = background(element.parentElement);
            return {
              control: element.getAttribute("name") ?? element.id ?? element.tagName,
              border,
              around,
              ratio: ratio(border, around),
            };
          }),
        };
      });
    }
    note("motionContrastTitles", results);
    const borders = Object.values(results).flatMap(
      (result) => (result as { controlBorders: { ratio: number }[] }).controlBorders,
    );
    expect
      .soft(
        borders.filter((border) => border.ratio < 3),
        "WCAG 1.4.11 input boundary 3:1",
      )
      .toEqual([]);
    const motion = Object.values(results).filter(
      (result) => (result as { animations: number }).animations > 0,
    );
    expect.soft(motion, "no animations run with reduced motion").toEqual([]);
  } finally {
    await closeAll(session);
  }
});
