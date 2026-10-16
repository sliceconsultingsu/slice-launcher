# Design profile PR 1: profile rewrite and reviewer digest — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the agreed design profile as `docs/design-profile.md` and make the AI reviewer read its short digest, without exceeding the reviewer's 30,000-character standards limit.

**Architecture:** Documentation plus one small loader change. The profile opens with a digest section between HTML comment markers. `scripts/ai-review/standards.mjs` extracts only that section and appends it to the trusted standards. Roughly 720 characters of duplicated wording are trimmed from `CONTRIBUTING.md`, `docs/architecture.md` and `AGENTS.md` to make room. No UI or runtime code changes in this PR.

**Tech stack:** Markdown, Node.js ESM scripts, `node:test`, Prettier, pnpm 10.17.1, Node 22 or 24.

**Spec:** [docs/superpowers/specs/2026-10-15-design-profile-design.md](../specs/2026-10-15-design-profile-design.md). This plan covers delivery step 1 only. Steps 2–4 get their own plans after this PR merges.

## Global constraints

- Total `loadStandards()` output must stay at or below **30,000 characters** (the existing `text(..., 30000)` bound). Do not raise the limit.
- Digest content (between the markers, trimmed) must be at most **1,600 characters**.
- Do not remove or weaken any security, permission, data-privacy, CI-trust or delivery rule while trimming. Only the five replacements in Task 1 are approved.
- No `Co-Authored-By: Claude` trailers and no "Generated with Claude Code" lines in commits or the PR.
- Work on branch `docs/design-profile-spec` (already contains the spec), based on current `origin/main`. Do not push to `main`.
- Copy follows the profile's own rules: sentence case, plain business language.

## Files

| File                              | Change                                                         |
| --------------------------------- | -------------------------------------------------------------- |
| `CONTRIBUTING.md`                 | Two wording trims (Task 1)                                     |
| `docs/architecture.md`            | Two wording trims (Task 1)                                     |
| `AGENTS.md`                       | One wording trim (Task 1)                                      |
| `docs/design-profile.md`          | Full rewrite to the spec, including the digest (Task 2)        |
| `scripts/ai-review/standards.mjs` | Add `extractDigest`, append digest in `loadStandards` (Task 3) |
| `scripts/ai-review.test.mjs`      | Update the standards fixture test, add digest tests (Task 3)   |

---

### Task 1: Trim duplicated wording in the trusted standards

**Files:**

- Modify: `CONTRIBUTING.md` (section "3. If you use an AI agent")
- Modify: `docs/architecture.md` (sections "Boundaries" and "Maintainability")
- Modify: `AGENTS.md` (section "Platform rules", last bullet)

**Interfaces:**

- Consumes: nothing.
- Produces: at least 724 characters of headroom used by Task 2's digest.

Each replacement removes wording that is stated in full elsewhere (the model guide, AGENTS.md or the design profile). Each old string must match exactly once.

- [ ] **Step 1: Record the starting size**

Run: `node -e 'import("./scripts/ai-review/standards.mjs").then(async m=>console.log((await m.loadStandards()).length))'`
Expected: `29712` (or within a few characters if `main` moved; note the number).

- [ ] **Step 2: Apply the five replacements**

In `CONTRIBUTING.md`, replace:

```text
Choose **Claude Opus 5.5** or **GPT-6 Astra**. Set reasoning to **High** while planning, then **Medium** while implementing the agreed work. Prefer these over weaker models for code changes; the aim is to reduce mistakes that break existing features. Model choice does not replace tests or your review. See [the model guidance](skills/models.md) for exceptions and difficult tasks.
```

with:

```text
Use **Claude Opus 5.5** or **GPT-6 Astra** with the [recommended reasoning settings](skills/models.md). Model choice does not replace tests or your review.
```

In `CONTRIBUTING.md`, replace:

```text
Your agent should work like a patient teacher: explain why a change matters, introduce one idea at a time and help you make informed decisions. You can ask it to explain more simply or show an example. Start with [agent skills](skills/README.md); the first collection is [Superpowers](skills/superpowers/README.md), which helps an agent plan, investigate problems and check its work.
```

with:

```text
Your agent should teach as it works (see [AGENTS.md](AGENTS.md)). Start with [agent skills](skills/README.md), beginning with [Superpowers](skills/superpowers/README.md).
```

In `docs/architecture.md`, replace:

```text
Keep TypeScript strict; do not hide errors with blanket lint disables, any, unchecked casts, or catch-and-ignore. Explain unusual assumptions near the code. Keep modules focused by behavior. Tests should prove user-visible behavior or a security/reliability invariant, including rejection paths. A named test script is a minimum contract, not useful coverage by itself.
```

with:

```text
Follow the implementation expectations in [AGENTS.md](../AGENTS.md); also avoid `any`. Tests prove user-visible behavior or a security/reliability invariant, including rejection paths; a named test script alone is not coverage.
```

In `docs/architecture.md`, replace:

```text
Common components and design tokens belong in `packages/ui`. Follow the [design profile](design-profile.md) for Slice's logo, typography, colors and accessible form conventions.
```

with:

```text
Shared components and design tokens belong in `packages/ui`; follow the [design profile](design-profile.md).
```

In `AGENTS.md`, replace:

```text
Follow the [design profile](docs/design-profile.md) for branding, copy and accessible controls, labels, focus, contrast and keyboard behavior.
```

with:

```text
Follow the [design profile](docs/design-profile.md) for all UI work.
```

- [ ] **Step 3: Verify the saving and that no rule was lost**

Run: `node -e 'import("./scripts/ai-review/standards.mjs").then(async m=>console.log((await m.loadStandards()).length))'`
Expected: the Step 1 number minus 724 (`28988` from `29712`).

Run: `git diff --word-diff -- CONTRIBUTING.md docs/architecture.md AGENTS.md`
Expected: only the five passages above changed. Read each removed phrase and confirm it is stated elsewhere: model guidance in `skills/models.md` and AGENTS.md "Recommended models"; teaching in AGENTS.md "Communicate as a business partner and teacher"; strict TypeScript, lint disables, unchecked casts and swallowed errors in AGENTS.md "Implementation expectations"; accessibility details in the design profile.

- [ ] **Step 4: Format check**

Run: `pnpm format:check`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 5: Commit**

```bash
git add CONTRIBUTING.md docs/architecture.md AGENTS.md
git commit -m "docs: trim duplicated guidance to make room for the design digest"
```

---

### Task 2: Rewrite the design profile

**Files:**

- Modify (full replacement): `docs/design-profile.md`

**Interfaces:**

- Consumes: Task 1's headroom.
- Produces: a profile whose digest sits between `<!-- reviewer-digest:start -->` and `<!-- reviewer-digest:end -->`, exactly once each; headings `## Review checklist` (linked from `CONTRIBUTING.md` and the PR template) and `## Not yet implemented` (referenced by the digest).

- [ ] **Step 1: Replace the file with Appendix A of this plan**

Copy the Markdown inside Appendix A's outer fence verbatim into `docs/design-profile.md`.

- [ ] **Step 2: Check the digest size and markers**

Run:

```bash
node -e 'const s=require("fs").readFileSync("docs/design-profile.md","utf8");const a="<!-- reviewer-digest:start -->",b="<!-- reviewer-digest:end -->";if(s.split(a).length!==2||s.split(b).length!==2)throw new Error("markers");console.log(s.slice(s.indexOf(a)+a.length,s.indexOf(b)).trim().length)'
```

Expected: `851` (any value at or below 1,600 passes the constraint; 851 is the measured design).

- [ ] **Step 3: Check links and anchors still resolve**

Run: `grep -rn "design-profile.md#" --include=*.md . | grep -v node_modules`
Expected: only `#review-checklist` anchors, and Appendix A contains `## Review checklist`.

Run:

```bash
python3 - <<'EOF'
import re, os
for f in ["docs/design-profile.md"]:
    for t, _ in re.findall(r'\]\(([^)#\s]+)(#[^)]*)?\)', open(f).read()):
        if not t.startswith("http") and not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), t))):
            print("BROKEN", t)
print("links checked")
EOF
```

Expected: `links checked` with no `BROKEN` lines.

- [ ] **Step 4: Format**

Run: `pnpm format` then `pnpm format:check`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 5: Commit**

```bash
git add docs/design-profile.md
git commit -m "docs: rewrite the design profile to the agreed standard"
```

---

### Task 3: Load the design digest into the AI reviewer's standards

**Files:**

- Modify: `scripts/ai-review/standards.mjs`
- Test: `scripts/ai-review.test.mjs` (the block starting at the `loadStandards` import, currently near line 361)

**Interfaces:**

- Consumes: `text(value, max)` from `scripts/ai-review/core.mjs` (throws `Error("Invalid text")` when too long or containing control characters); Task 2's markers.
- Produces:
  - `export function extractDigest(markdown: string): string`: returns the trimmed text between the markers. Throws `Error("Design digest markers missing or duplicated")`, `Error("Design digest empty")` or `Error("Design digest too long")`.
  - `export const DIGEST_LIMIT = 1600`.
  - `loadStandards(read)` now also reads `docs/design-profile.md` and appends `"docs/design-profile.md (reviewer digest)\n" + digest`. A missing file still fails closed.

- [ ] **Step 1: Write the failing tests**

In `scripts/ai-review.test.mjs`, change the import line:

```js
const { loadStandards } = await import("./ai-review/standards.mjs");
```

to:

```js
const { loadStandards, extractDigest, DIGEST_LIMIT } = await import("./ai-review/standards.mjs");
```

Replace the existing test `"required trusted standards must all load; missing standards fail closed"` with:

```js
const digestProfile = (body) =>
  `# Profile\n\nIntro.\n\n<!-- reviewer-digest:start -->\n\n${body}\n\n<!-- reviewer-digest:end -->\n\n## Tokens\n\nFull details stay out.`;

test("required trusted standards must all load; missing standards fail closed", async () => {
  const files = new Map([
    ["AGENTS.md", "One platform; agents must verify their work"],
    ["CONTRIBUTING.md", "Contribution rules"],
    ["docs/architecture.md", "Apps cannot import app internals"],
    ["docs/security-review.md", "Review authentication and database changes"],
    ["docs/data-boundary.md", "Validate Cloudflare Access identity"],
    ["docs/design-profile.md", digestProfile("## Reviewer digest\n\n- Use token variables.")],
  ]);
  const read = async (path) => {
    if (!files.has(path)) throw new Error("missing");
    return files.get(path);
  };
  const standards = await loadStandards(read);
  assert.match(standards, /Apps cannot import/);
  assert.match(standards, /docs\/design-profile\.md \(reviewer digest\)\n## Reviewer digest/);
  assert.doesNotMatch(standards, /Full details stay out/);
  files.delete("docs/design-profile.md");
  await assert.rejects(loadStandards(read), /missing/);
  files.set("docs/design-profile.md", "# Profile without markers");
  await assert.rejects(loadStandards(read), /Design digest markers/);
  files.set("docs/design-profile.md", digestProfile("ok"));
  files.delete("docs/architecture.md");
  await assert.rejects(loadStandards(read), /missing/);
});

test("design digest extraction rejects missing, duplicated, empty and oversized digests", () => {
  assert.equal(extractDigest(digestProfile("  Keep this.  ")), "Keep this.");
  assert.throws(() => extractDigest("no markers"), /Design digest markers/);
  assert.throws(
    () => extractDigest(digestProfile("a") + "\n<!-- reviewer-digest:start -->"),
    /Design digest markers/,
  );
  assert.throws(
    () => extractDigest("<!-- reviewer-digest:end --> <!-- reviewer-digest:start -->"),
    /Design digest markers/,
  );
  assert.throws(() => extractDigest(digestProfile("   ")), /Design digest empty/);
  assert.throws(() => extractDigest(digestProfile("x".repeat(DIGEST_LIMIT + 1))), /too long/);
  assert.equal(extractDigest(digestProfile("x".repeat(DIGEST_LIMIT))).length, DIGEST_LIMIT);
});

test("the checked-in design profile supplies the reviewer digest", async () => {
  const standards = await loadStandards();
  assert.match(standards, /docs\/design-profile\.md \(reviewer digest\)\n## Reviewer digest/);
  assert.ok(standards.length <= 30000);
});
```

Keep the existing test `"checked-in contributor guidance fits the trusted reviewer input limit"` unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/ai-review.test.mjs`
Expected: FAIL. `extractDigest` is not exported (`TypeError: extractDigest is not a function`), and the fixture test fails because the digest label is missing.

- [ ] **Step 3: Implement the loader change**

Replace the whole of `scripts/ai-review/standards.mjs` with:

```js
import { readFile } from "node:fs/promises";
import { text } from "./core.mjs";

const DIGEST_SOURCE = "docs/design-profile.md";
const DIGEST_START = "<!-- reviewer-digest:start -->";
const DIGEST_END = "<!-- reviewer-digest:end -->";
export const DIGEST_LIMIT = 1600;

// Only the profile's digest is trusted reviewer input; the full profile would exceed the standards budget.
export function extractDigest(markdown) {
  const start = markdown.indexOf(DIGEST_START);
  const end = markdown.indexOf(DIGEST_END);
  if (
    start === -1 ||
    end < start ||
    markdown.indexOf(DIGEST_START, start + 1) !== -1 ||
    markdown.indexOf(DIGEST_END, end + 1) !== -1
  )
    throw new Error("Design digest markers missing or duplicated");
  const digest = markdown.slice(start + DIGEST_START.length, end).trim();
  if (!digest) throw new Error("Design digest empty");
  if (digest.length > DIGEST_LIMIT) throw new Error("Design digest too long");
  return digest;
}

export async function loadStandards(read = readFile) {
  const paths = [
    "AGENTS.md",
    "CONTRIBUTING.md",
    "docs/architecture.md",
    "docs/security-review.md",
    "docs/data-boundary.md",
  ];
  const contents = await Promise.all(
    paths.map(async (path) => {
      const content = await read(path, "utf8");
      if (!content.trim()) throw new Error("Required trusted standards empty");
      return path + "\n" + content;
    }),
  );
  const digest = extractDigest(await read(DIGEST_SOURCE, "utf8"));
  contents.push(`${DIGEST_SOURCE} (reviewer digest)\n${digest}`);
  return text(contents.join("\n"), 30000);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/ai-review.test.mjs`
Expected: PASS, including the three tests above and `"checked-in contributor guidance fits the trusted reviewer input limit"`.

Run: `node -e 'import("./scripts/ai-review/standards.mjs").then(async m=>console.log((await m.loadStandards()).length))'`
Expected: about `29881` (28988 + 42 for the label and separator + 851). It must be at most 30000.

- [ ] **Step 5: Commit**

```bash
git add scripts/ai-review/standards.mjs scripts/ai-review.test.mjs
git commit -m "feat: give the AI reviewer the design profile digest"
```

---

### Task 4: Full verification, push and pull request

**Files:** none changed.

**Interfaces:**

- Consumes: Tasks 1–3.
- Produces: a PR into `main`.

- [ ] **Step 1: Run the repository checks**

Run, from the repository root with Node 22 or 24:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all pass. Report the pass counts from `pnpm test`. This PR changes no UI, so `pnpm test:e2e`, `pnpm build` and screenshots are not required; say so in the PR.

- [ ] **Step 2: Review the diff**

Run: `git diff origin/main --stat` and `git diff origin/main -- AGENTS.md CONTRIBUTING.md docs/architecture.md scripts/`
Expected: the five trims, the profile rewrite, the spec and this plan, and the loader and tests only.

- [ ] **Step 3: Push**

```bash
git push -u origin docs/design-profile-spec
git ls-remote origin docs/design-profile-spec
```

Expected: the remote SHA equals `git rev-parse HEAD`.

- [ ] **Step 4: Open the PR**

```bash
gh pr create --repo sliceconsultingsu/slice-launcher --base main --head docs/design-profile-spec \
  --title "Adopt the agreed Slice design profile and give the AI reviewer its digest" \
  --body-file pr-body.md
```

Write `pr-body.md` (do not commit it) using the PR template headings: **Purpose** (the agreed profile replaces the first draft; the spec and plan are included), **Behavior** (profile content summary; the reviewer now reads an 851-character digest; the five trims and why each is safe), **Validation** (commands and pass counts, standards length before and after, which checks were not run and why), **Deployment and migration impact** ("None. Documentation and AI-review input only."), **Sensitive-change review** (tick each box with a one-line note; the AI-review change alters trusted reviewer input, so say that it only appends repository-controlled text read from the trusted base). No attribution lines.

- [ ] **Step 5: Report state**

Report the PR link, CI state, and that the work is pushed and awaiting review, not merged or deployed.

---

## Appendix A: `docs/design-profile.md`

````markdown
# Slice design profile

This is the standard for everything people see in Slice: the launcher, the account workspace, the connect-your-AI page and every app module. Follow it so consultants moving between apps feel they are in one product, and so the next student team can change a screen without guessing.

The profile describes the target. Parts of it are still being built; [Not yet implemented](#not-yet-implemented) says what to use in the meantime. If code and this profile disagree in a way that section does not explain, raise it in your PR.

<!-- reviewer-digest:start -->

## Reviewer digest

Applies to new or changed UI. Items listed under "Not yet implemented" are targets, not violations.

- Use `@slice/ui` components and token variables; no colour literals outside `packages/ui/src/tokens.css`.
- One primary button per view; destructive actions use `ConfirmDialog`.
- Each app ships a square, full-bleed `icon.svg` or `icon.png` with no scripts, handlers, external links, embedded images or animation, its origin and licence in the README, and a `guide.md` for consultants with no private data or raw HTML.
- Apps render inside the shared shell and add no headers, fonts, themes, UI kits or global CSS.
- Sentence case, verb-first buttons; errors state what happened and what to do, never raw technical messages.
- WCAG 2.2 AA: labels, visible focus, keyboard use, status and alert roles, checked at 390px and 1280px.

<!-- reviewer-digest:end -->

## How to use this profile

**Contributors:** read the [principles](#principles), find the [components](#components) you need, and complete the [review checklist](#review-checklist) in your PR.

**AI agents:** read this file before changing anything under `platform/app/`, `platform/apps/`, `platform/src/**/*.tsx` or `packages/ui/`. Then:

1. Reuse a component from the [components](#components) table, or the interim class listed in [Not yet implemented](#not-yet-implemented). Name what you used in your summary.
2. Use only the tokens, type sizes, radii and breakpoints listed here. If you need a new one, propose it in this file in the same PR.
3. Write interface text in the [copy](#copy) style.
4. Before handoff, report each [review checklist](#review-checklist) item as checked, not applicable, or not verified, with the reason.

A prompt a consultant can paste:

> Read AGENTS.md and docs/design-profile.md. Build this screen with the existing Slice components and tokens. Don't introduce new colours, fonts, UI libraries or global styles. When you finish, go through the design profile's review checklist and tell me what you checked at desktop and mobile widths.

## Principles

1. **Work first.** Screens lead with the task or the data. No hero banners, stock imagery or decoration.
2. **A quiet interface; apps carry the colour.** Warm paper, charcoal ink and one burnt-orange accent. The accent marks the single most important action or the current location. App icons are where colour and personality live.
3. **One product, many apps.** Apps render inside the platform shell with shared components. An app does not bring its own theme, fonts, logo or navigation.
4. **Plain business language.** Labels say what happens, in words a new consultant understands.
5. **Accessible by default.** Keyboard, screen reader, contrast and mobile use are requirements checked before review.
6. **Reuse before inventing.** A new pattern goes into `packages/ui` and this profile, never into one app only.

## Brand

- Use only the original logo at `platform/public/brand/slice-logo.png` ([source](brand-assets.md)). Do not recolour, redraw, stretch or crop it, and do not add effects.
- The logo appears once, in the platform header, linking home with the accessible name "Slice Consulting home".
- The organisation is **Slice Consulting**; the launcher is **App Launcher**. Apps use the `name` in their `app.json`.
- Do not use other organisations' marks or Syracuse University marks beyond what the supplied logo contains.

## Tokens

All colours are CSS variables defined once in `packages/ui/src/tokens.css`. Use `var(--token)` in CSS or `text-(--token)` in Tailwind. Never type a colour value in a component.

| Token                           | Value                | Use                                                        |
| ------------------------------- | -------------------- | ---------------------------------------------------------- |
| `--page`                        | `#faf9f6`            | Page background                                            |
| `--surface`                     | `#fffefb`            | Cards, secondary buttons                                   |
| `--ink`                         | `#292c30`            | Text, secondary-button outline (13.3:1 on page)            |
| `--muted`                       | `#666962`            | Secondary text (5.3:1 on page)                             |
| `--accent`                      | `#a4461c`            | Primary fill, links, current tab, focus ring (white 6.0:1) |
| `--accent-hover`                | `#853915`            | Primary hover                                              |
| `--accent-tint`                 | `#fff0e3`            | Accent-tinted backgrounds                                  |
| `--line`                        | `#e5e4df`            | Decorative borders and dividers                            |
| `--control-border`              | `#868880`            | Input and select borders (3.6:1 on white)                  |
| `--selected`                    | `#f3efe7`            | Selected or hovered row                                    |
| `--selection`                   | `#ffd8b7`            | Text selection                                             |
| `--notice-bg`, `--notice-line`  | `#f6f3e9`, `#ddd9c9` | Information notice                                         |
| `--error-bg`, `--error-line`    | `#fff0ea`, `#e9baa6` | Error notice                                               |
| `--status-neutral-bg`, `-ink`   | `#eeeee8`, `#55594e` | Neutral badge (6.2:1)                                      |
| `--status-active-bg`, `-ink`    | `#e8efe5`, `#3c573b` | Active badge (6.8:1)                                       |
| `--status-pending-bg`, `-ink`   | `#f5ebd9`, `#735124` | Pending or invited badge (6.1:1)                           |
| `--status-suspended-bg`, `-ink` | `#f6e6e1`, `#914833` | Suspended badge (5.5:1)                                    |
| `--avatar-bg`, `--avatar-ink`   | `#f0e7dc`, `#713f27` | Initials avatars (7.0:1)                                   |

There is no dark theme, and red is not a brand colour: errors use the error notice and clear words. Never communicate meaning with colour alone.

### Type

Font stack, set once: `"Avenir Next", Avenir, "Segoe UI", ui-sans-serif, system-ui, sans-serif`. Do not load web fonts.

| Use                | Size and weight             |
| ------------------ | --------------------------- |
| Page title (`h1`)  | 32px / 700 (26px at ≤650px) |
| Section heading    | 22px / 700                  |
| Card title         | 18px / 700                  |
| Body               | 15px / 400, line-height 1.6 |
| Labels and buttons | 14px / 600–700              |
| Small and notes    | 13px / 400                  |

One `h1` per page, headings in order, sentence case everywhere.

### Shape and layout

- **Radii:** buttons and badges 999px (pills) · cards 16px · notices 9px · inputs 8px · avatars 50%.
- **Borders** are 1px. No shadows or gradients in interface elements; app icons are exempt.
- **Shell:** centred, `max-width: 1440px`, 6% side margins.
- **Breakpoints:** 800px (two-panel layouts stack), 650px (smaller header and title), 500px (toolbars stack).
- **Targets:** buttons and inputs at least 44px tall.

## Page shell

Every page, apps included, uses one shell:

```text
skip link "Skip to content" → #main
header   logo · "App Launcher" or the app's icon and name · account menu
main#main
footer   "Slice Consulting" · project links
```

App modules render inside `main`. They never add their own header, footer or `<html>` structure.

## Components

From `@slice/ui`. Apps import these instead of restyling them.

| Component       | Use                                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`        | `primary` (filled accent, one per view), `secondary` (ink outline), `text`, `danger` (only in `ConfirmDialog`). Pill-shaped, bold label.                                         |
| `ConfirmDialog` | Any destructive or hard-to-undo action. Names the consequence and the action ("Remove member").                                                                                  |
| `PageHeader`    | Page title with optional eyebrow and actions.                                                                                                                                    |
| `Card`          | Grouped content on a surface with a line border.                                                                                                                                 |
| `Tabs`          | Section switcher; the current tab has `aria-current` and an accent underline.                                                                                                    |
| `Field`         | Label, control, hint and error together. A control never appears without a label.                                                                                                |
| `Notice`        | `info` announces with `role="status"`; `error` announces with `role="alert"` and offers a next step.                                                                             |
| `Badge`         | A status word with its colour pair.                                                                                                                                              |
| `EmptyState`    | A heading, one sentence and an optional action.                                                                                                                                  |
| `Table`         | Tabular data; becomes labelled stacked rows at ≤650px.                                                                                                                           |
| `AppIcon`       | An app's icon at 20, 32, 40 or 48px, as `<img alt="">` with rounded corners.                                                                                                     |
| `AppCard`       | Launcher card: 40px icon, bold title, description up to three lines, then **Open** and **Guide** pills at the bottom. "Coming soon" badge replaces Open when an app has no link. |

App-specific layout styles may live in the app folder, using tokens only. If a component you need is missing, add it to `packages/ui` and to this table in the same PR.

## App icons

Every app has an icon, and the style is up to its designer.

**Required (checked by CI):**

- Exactly one `icon.svg` or `icon.png` in `platform/apps/<id>/`, replacing the starter from `pnpm app:create`.
- Square and full-bleed: an SVG with a square `viewBox`, or a 512×512 PNG with no transparency. The platform rounds the corners.
- Safe and light. SVG: at most 32 KiB, with no scripts, event handlers, external links, embedded images, `foreignObject` or animation. PNG: at most 150 KiB, with no metadata and no animation.
- An `## Icon` section in the app README stating how the icon was made (original, adapted from a named source, or generated with a named tool), its licence and its author. Only original or permissively licensed artwork (MIT, ISC, Apache-2.0, CC0, CC-BY); no real people's faces and no other organisations' logos.

**Tips:** check it at 20px; make it easy to tell apart from the other apps' icons; keep important detail away from the corners.

## Guides

Each app ships `platform/apps/<id>/guide.md` for consultants: what the app is for and how to do its main tasks, in plain language. Guides appear at `/guides/<id>`, open to any signed-in member, so they must contain no private data. Raw HTML is not rendered.

## Copy

Follow the [communication standard](../AGENTS.md#communicate-as-a-business-partner-and-teacher): plain business language, outcome first.

- Sentence case everywhere.
- Buttons are one to three words, verb first: "Open", "Add member", "Save access". Not "Submit" or "OK".
- No "please", "successfully" or exclamation marks. Contractions are fine.
- Errors say what happened and what to do, without first person, technical detail or private data: "Couldn't save changes. Reload and try again."
- Empty states invite an action: "Add your first member".
- Use "your" for the user's things.
- Use synthetic names and emails in examples, fixtures and screenshots.

## Accessibility

Target WCAG 2.2 AA.

- Keep the skip link and one `main#main` on every page.
- Every control has a visible label or an accessible name.
- Focus is always visible: a 3px `--accent` outline. Never remove outlines.
- Everything works with a keyboard, in a sensible order. Use `button` for actions and `a` for navigation.
- Announce changes with `role="status"`, and errors with `role="alert"`.
- Links that open a new tab say so to screen readers.
- Nothing depends on hover alone.
- Large motion respects `prefers-reduced-motion`.
- Decorative images and icons use `alt=""` or `aria-hidden="true"`.

## Responsive behavior

- Check every screen at 390px and 1280px wide.
- The page never scrolls sideways. Only tab rows, tables and code blocks may scroll inside themselves.
- Long names and emails wrap or truncate with an ellipsis.

## App modules

- Render inside the platform shell. No extra header, logo, footer, theme or global stylesheet.
- Use `@slice/ui` and tokens. No UI frameworks, component libraries, icon packs or web fonts without maintainer agreement.
- Keep the `app.json` description to one plain sentence about who the app helps and how; it appears on the launcher card.

## Review checklist

Copy this into the PR's Validation section for any visible change, and mark each item.

- [ ] Uses `@slice/ui` components and tokens; any new pattern is shared and added to this profile.
- [ ] No new colours, fonts, shadows, UI libraries or global styles.
- [ ] Copy is plain, sentence case and verb-led; errors explain the next step and expose no private data.
- [ ] Keyboard-only walk-through done; focus is visible and in order.
- [ ] Labels, accessible names and status or alert roles are in place; `pnpm test:e2e` accessibility checks pass.
- [ ] Checked at 390px and 1280px wide; no sideways page scroll.
- [ ] For a new app: icon and README `## Icon` section, `guide.md` written for consultants.
- [ ] Screenshots at both widths attached, containing synthetic data only.

## Not yet implemented

The standard above is being delivered in stages. Until each stage lands, use what exists today. Reviewers treat these items as targets, not violations.

| Target                                                              | Arrives in      | Use until then                                                                                                                                                                                                                     |
| ------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.css` and token names                                        | Components PR   | The four variables in `platform/app/globals.css` (`--ink`, `--muted`, `--accent`, `--line`); other values come from the token table above.                                                                                         |
| `@slice/ui` components, pill buttons, new type scale                | Components PR   | Classes in `platform/app/globals.css`: `.primary-button`, `.secondary-button`, `.text-button`, `.notice`, `.error-notice`, `.status-badge`, `.account-card`, `.form-stack`, `.account-tabs`, `.section-toolbar`, `.empty-catalog`. |
| Darker input borders (`--control-border`)                           | Components PR   | Existing inputs; don't add new low-contrast borders.                                                                                                                                                                               |
| App icons, guides, `/guides/<id>`, `AppCard`, shared app page shell | App identity PR | Today's `AppTile` and the plain app page header. New apps may add `icon.svg` or `icon.png` and `guide.md` early.                                                                                                                   |
| `check:design` and catalog-wide browser tests on WCAG 2.2           | Enforcement PR  | The review checklist and the existing WCAG 2.1 axe checks.                                                                                                                                                                         |

## Changing this profile

Propose changes in a PR that updates this file together with the affected tokens, components and screenshots, and explain why. Brand changes (logo, accent colour, font) need maintainer agreement first. Keep the reviewer digest at or below 1,600 characters; a test enforces the limit.
````
