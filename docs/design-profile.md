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
