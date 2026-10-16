# Slice design profile: design spec

- **Date:** October 15, 2026
- **Status:** proposed, awaiting maintainer review
- **Scope:** the visual, interaction and contribution standard for the launcher, the account workspace and every app module, and how agents and CI enforce it.

## Goal

Give contributors and their AI agents one standard that makes every Slice screen look, read and behave like one product, with the mechanical parts checked by CI so agents cannot drift unnoticed.

Non-goals: a dark theme, a cool-neutral palette, a category sidebar, a shared icon art style (deferred; see [Icons](#1-app-icons)), and any change to permissions, membership or data handling.

## Decisions

These were settled one at a time with the maintainer. Each row records the alternatives that were considered and rejected.

| #   | Topic            | Decision                                                                           | Rejected                                                    |
| --- | ---------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | Visual direction | Refine today's "paper and ink" look                                                | Citrus studio, boardroom, dark workbench                    |
| 2   | App icons        | Required for every app; style left free                                            | Library icons, enforced palettes, monogram or badge family  |
| 3   | Icon format      | SVG or PNG                                                                         | SVG only                                                    |
| 4   | Icon shape       | Full-bleed square, corners rounded by the platform                                 | Shared plate, free-form silhouette                          |
| 5   | Icon origin      | Original or permissively licensed; origin recorded                                 | Original only, unstated                                     |
| 6   | Palette          | Keep warm paper neutrals and burnt-orange accent                                   | Cool neutral (compared side by side)                        |
| 7   | Launcher card    | Icon, title, description, **Open** and **Guide** pill buttons pinned to the bottom | Whole-card link, phone-style icon grid, today's dark button |
| 8   | Guide            | Every app ships `guide.md`, rendered by the platform                               | Link to the README, optional guide URL                      |
| 9   | Buttons and type | Pill buttons, bolder and larger headings                                           | Keep 8px buttons and the current scale                      |
| 10  | Shared UI        | React components in `@slice/ui`                                                    | CSS classes only, classes now and components later          |
| 11  | Accessibility    | WCAG 2.2 AA                                                                        | Stay on 2.1 AA                                              |
| 12  | AI reviewer      | A short design digest joins the trusted standards                                  | CI and humans only; raise the 30,000-character limit        |

The references were Adobe's and JetBrains' product catalogs. What was taken from them: the quiet interface with colour carried by the icons, the card anatomy with actions aligned at the bottom, and pill buttons. Their icon families were explored but not adopted: the drafts read as cheap or derivative, and a Slice icon style is left to a later design project.

## 1. App icons

**Required (CI-enforced)**

- Each app directory contains exactly one of `icon.svg` or `icon.png`, and it is not byte-identical to the starter written by `pnpm app:create`.
- **Square and full-bleed.** SVG: the `viewBox` width equals its height. PNG: 512×512, colour type RGB (no alpha channel), so the artwork covers the whole square.
- **Safe and light.**
  - SVG at most 32 KiB, parsed with a real XML parser. Rejected: parse errors, `DOCTYPE` or entity declarations, `script`, `foreignObject`, `image`, `style` elements, animation elements (`animate*`, `set`), any `on*` attribute, any `href` or `xlink:href` not beginning with `#`, and any `url(...)` not beginning with `url(#`.
  - PNG at most 150 KiB, valid signature, no `tEXt`, `iTXt`, `zTXt` or `eXIf` chunks, and no `acTL` chunk (animation).
- The app README has an `## Icon` section stating how the icon was made (original, adapted from a named source, or generated with a named tool), its licence, and its author.

**Left to the designer:** style, colours, gradients, effects, illustration or abstraction.

**Optional tips in the profile:** check it at 20px; make it easy to tell apart from the other apps' icons; keep detail away from the rounded corners.

**Display:** the platform shows icons only through `<img alt="">`, never inline, at 20, 32, 40 or 48px with a border radius of about 23% of the size. `pnpm apps:sync` copies each icon to `platform/public/app-icons/<id>.<ext>`; `check:platform` rejects a stale copy, as it does today for the catalog.

**Deferred:** a shared Slice icon style. Concepts can be explored with an image model (a ready prompt exists in the design conversation) or by a designer. Adopting a style later means a profile PR with example icons, not a change to these rules.

## 2. Visual system

### Tokens

All colours are CSS variables in `packages/ui/src/tokens.css`, imported once by the platform. Values are today's, with one fix.

| Token                                         | Value                     | Use                                                              |
| --------------------------------------------- | ------------------------- | ---------------------------------------------------------------- |
| `--page`                                      | `#faf9f6`                 | Page background                                                  |
| `--surface`                                   | `#fffefb`                 | Cards, secondary buttons                                         |
| `--ink`                                       | `#292c30`                 | Text, secondary-button outline                                   |
| `--muted`                                     | `#666962`                 | Secondary text (5.3:1 on page)                                   |
| `--accent`                                    | `#a4461c`                 | Primary fill, links, current tab, focus ring (white 6.0:1)       |
| `--accent-hover`                              | `#853915`                 | Primary hover                                                    |
| `--accent-tint`                               | `#fff0e3`                 | Accent-tinted backgrounds                                        |
| `--line`                                      | `#e5e4df`                 | Decorative borders and dividers                                  |
| `--control-border`                            | `#868880` (was `#cfcec6`) | Input and select borders: **3.6:1 on white**, fixing WCAG 1.4.11 |
| `--selected`                                  | `#f3efe7`                 | Selected or hovered row                                          |
| `--selection`                                 | `#ffd8b7`                 | Text selection                                                   |
| `--notice-bg` / `--notice-line`               | `#f6f3e9` / `#ddd9c9`     | Info notice                                                      |
| `--error-bg` / `--error-line`                 | `#fff0ea` / `#e9baa6`     | Error notice                                                     |
| `--status-{neutral,active,pending,suspended}` | existing pairs            | Badge text and background, each at least 5.4:1                   |
| `--avatar-bg` / `--avatar-ink`                | `#f0e7dc` / `#713f27`     | Initials avatars                                                 |

The dark launch button (`#30372e`) is removed.

### Type

Same font stack: `"Avenir Next", Avenir, "Segoe UI", ui-sans-serif, system-ui, sans-serif`.

| Use                | Size and weight             |
| ------------------ | --------------------------- |
| Page title         | 32px / 700 (26px at ≤650px) |
| Section heading    | 22px / 700                  |
| Card title         | 18px / 700                  |
| Body               | 15px / 400, line-height 1.6 |
| Labels and buttons | 14px / 600–700              |
| Small and notes    | 13px / 400                  |

Sentence case everywhere; one `h1` per page.

### Shape and layout

- Radii: buttons and badges 999px (pills), cards 16px, notices 9px, inputs 8px, avatars 50%.
- 1px borders. No shadows or gradients in interface chrome; icons are exempt.
- The existing shell width (1440px, 6% margins), grid and breakpoints (800, 650, 500px) stay.
- Controls are at least 44px tall.

### Components (`@slice/ui`)

| Component       | Contract                                                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Button`        | `variant`: `primary` (filled accent), `secondary` (1.5px ink outline), `text`, `danger`. At most one `primary` per view; `danger` only inside `ConfirmDialog`. Renders `<a>` when given `href`.                                                        |
| `ConfirmDialog` | Native `<dialog>` for destructive or hard-to-undo actions; names the consequence and the action.                                                                                                                                                       |
| `PageHeader`    | Title, optional eyebrow and actions.                                                                                                                                                                                                                   |
| `Card`          | Surface, line border, 16px radius.                                                                                                                                                                                                                     |
| `Tabs`          | Section switcher with `aria-current`; scrolls horizontally on narrow screens.                                                                                                                                                                          |
| `Field`         | Label, control, hint and error message wired with `aria-describedby`; a control cannot render without a label.                                                                                                                                         |
| `Notice`        | `info` (`role="status"`) and `error` (`role="alert"`).                                                                                                                                                                                                 |
| `Badge`         | Status word plus colour, never colour alone.                                                                                                                                                                                                           |
| `EmptyState`    | Heading, one sentence and an optional action.                                                                                                                                                                                                          |
| `Table`         | Semantic table that becomes labelled stacked rows at ≤650px.                                                                                                                                                                                           |
| `AppIcon`       | `<img alt="">` at 20, 32, 40 or 48px with the platform corner radius.                                                                                                                                                                                  |
| `AppCard`       | 40px icon, title, description clamped to three lines, then **Open** (primary) and **Guide** (secondary) pinned to the bottom. "Coming soon" badge instead of Open when the app has no link. Accessible names include the app ("Open Project tracker"). |

Components are presentational: props in, markup out, styled only with tokens. The launcher, the account workspace and the connect-your-AI page migrate to them, so the platform's own screens are the reference implementation. Apps import these components instead of restyling them. App-specific layout styles stay in the app folder and use tokens only.

### Page shell

Every page, apps included, uses one shell component: skip link, header (logo, "App Launcher" or the app's icon and name, account menu), `main#main`, footer. This replaces the plain two-link header on `/apps/<id>`.

### Guides

- Each app ships `platform/apps/<id>/guide.md`, written for consultants: what the app is for and how to do its main tasks. `pnpm app:create` writes a starter; CI rejects it until it is replaced.
- Guides are public metadata, like `app.json`, and must contain no private data.
- They are served at **`/guides/<id>`**, outside the guarded `/apps/<id>` dispatch, so any signed-in member can read a guide before being granted the app. They render inside the shell from the build-time catalog.
- Markdown is rendered with raw HTML disabled. The renderer library is chosen during planning and verified against current documentation.

### Copy

- Sentence case; buttons are one to three words, verb first ("Add member").
- No "please", "successfully" or exclamation marks; contractions are fine.
- Errors say what happened and what to do, without first person or raw technical messages ("Couldn't save changes. Reload and try again.").
- Empty states invite an action ("Add your first member").
- "Your" for the user's things.
- Synthetic data in every example, fixture and screenshot.

### Accessibility

WCAG 2.2 AA. Full keyboard operation; a visible 3px accent focus ring; correct names and roles; status and error announcements; large motion only with `prefers-reduced-motion` respected. Every screen is checked at 390px and 1280px wide.

## 3. Enforcement

### Where the rules live

- `docs/design-profile.md` is the single source. It opens with a reviewer digest between `<!-- reviewer-digest:start -->` and `<!-- reviewer-digest:end -->`.
- `scripts/ai-review/standards.mjs` adds that digest section, and only that section, to the trusted standards. A test fails if the digest exceeds 1,600 characters or if the total exceeds the existing 30,000-character limit. The roughly 1,250 characters needed are recovered by tightening wording in `AGENTS.md`, `CONTRIBUTING.md` and `docs/architecture.md`, without removing any security or permission rule. The proposed cuts are listed in that PR for maintainer review.
- `AGENTS.md` points to the profile for any UI change. `packages/ui/AGENTS.md`, the generated app README and the PR template repeat the pointer at the place agents work.

### `check:design` (runs in `pnpm lint`)

1. Icon rules from [section 1](#1-app-icons).
2. Guide: `guide.md` exists, differs from the starter, and contains no raw HTML tags.
3. **No stray colours:** hex, `rgb()`, `rgba()`, `hsl()` or `hsla()` literals in `.ts`, `.tsx` and `.css` files under `platform/apps`, `platform/app`, `platform/src` and `packages/ui/src` fail, except in `tokens.css`. Test files and fixtures are not exempt. There is no inline escape hatch; a new colour is added to `tokens.css` and the profile in a reviewed PR.

The existing `check:platform` already prevents app-level `package.json` files, so new UI libraries can only enter through the host manifest, which the maintainer reviews.

### Browser tests

One Playwright spec iterates the generated catalog. For each app it opens the app page and its guide (and once, the launcher and account pages) at 390px and 1280px, runs axe with WCAG 2.2 AA tags, and saves screenshots as CI artifacts. New apps are covered without new test code. While there are no business apps, a synthetic fixture app exists only in the end-to-end harness, which artifact validation already keeps out of production builds.

### Human review

The PR template's design checklist covers what machines cannot judge: colour harmony, icon quality, copy and whether a screen feels like Slice. AI review stays advisory.

## Delivery plan

Four PRs, each independently reviewable and releasable, in this order:

1. **Profile and reviewer digest.** A new PR (the first profile, #25, is merged) that rewrites `docs/design-profile.md` to this spec, with a "Not yet implemented" section that shrinks as later PRs land. Add the digest loader, its tests and the standards trims. Documentation and reviewer change only; no UI changes.
2. **Tokens and components.** `tokens.css`, the component set, pill buttons and the new type scale, the control-border fix, and migration of the launcher, the account workspace and the connect-your-AI page (`platform/app/connect-ai`, added in #28 with its own styles). Desktop and mobile screenshots of every changed screen.
3. **App identity.** Icon and guide files, scaffold changes, icon publishing in `apps:sync`, `AppIcon` and `AppCard` with Open and Guide, `/guides/<id>`, and the shared page shell on app pages.
4. **Enforcement.** `check:design`, the catalog-driven browser spec with WCAG 2.2 tags, and the PR-template checklist. The colour rule lands last because it fails until PRs 2 and 3 have removed today's hard-coded colours.

## Risks and open questions

- **Bolder type and pill buttons change every screen.** PR 2 must include before and after screenshots and rerun accessibility checks.
- **WCAG 2.2 axe tags.** Confirm that the installed `@axe-core/playwright` supports `wcag22aa`; if not, upgrading it is part of PR 4.
- **Avenir Next is not available on Windows or Linux.** The stack falls back to Segoe UI or the system sans; 700-weight headings must be checked on the fallback.
- **Digest budget.** Approximately 290 characters of headroom remain today. If the trims cannot recover enough without losing meaning, the digest shrinks rather than security text.
- **Public guides.** A guide that leaks private details is published to every member. The guide starter and checklist say so; review remains the safeguard.
- **Icon quality is not enforced.** With style left free, the launcher may look uneven until a shared icon style is adopted.
