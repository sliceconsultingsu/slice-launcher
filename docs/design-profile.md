# Slice design profile

This is the visual and interaction standard for everything people see in Slice: the launcher, the account workspace and every app module. Follow it so a consultant moving between apps feels they are in one product, and so the next student team can change a screen without guessing.

It records what the platform already does, names the values, and says where today's code falls short. When the code and this profile disagree, raise it in your PR instead of silently picking one.

## How to use this profile

**Contributors:** read the [principles](#principles), skim the [components](#components) you need, and run the [review checklist](#review-checklist) before opening a PR.

**AI agents:** read this file before changing anything under `platform/app/`, `platform/apps/`, `platform/src/**/*.tsx` or `packages/ui/`. Then:

1. Reuse an existing class or component from the [components](#components) table. Name the one you used in your summary.
2. Use only the colors, type sizes, radii and breakpoints listed here. If you need a new one, stop and propose it; do not add it on your own.
3. Write interface text in the [voice](#voice-and-copy) described below.
4. Before handoff, report each [review checklist](#review-checklist) item as checked, not applicable, or not verified, with the reason.

A prompt a consultant can paste:

> Read AGENTS.md and docs/design-profile.md. Build this screen with the existing Slice components and tokens. Do not introduce new colors, fonts, icon libraries or CSS frameworks. When you finish, go through the design profile's review checklist and tell me what you checked at desktop and mobile widths.

## Principles

1. **Work first, decoration second.** Slice is a tool consultants use between client tasks. Screens lead with the task or the data. No hero banners, stock imagery or ornamental illustrations.
2. **Warm and calm.** Off-white paper, charcoal ink, one orange accent. The accent marks the single most important action or the current location; it is not a fill color for decoration.
3. **One product, many apps.** Apps live inside the platform shell and use the shared styles. An app does not bring its own theme, fonts, logo or navigation chrome.
4. **Plain business language.** Labels say what happens in words a new consultant understands. Avoid internal codes, stack names and jargon.
5. **Accessible by default.** Keyboard, screen reader, contrast and mobile use are requirements, not polish. They are checked before review.
6. **Reuse before inventing.** A new pattern needs a reason another screen will also benefit from it. Then it goes into `packages/ui` or `platform/app/globals.css`, not into one app.

## Brand

- Use only the original logo at `platform/public/brand/slice-logo.png`. Its source is recorded in [brand assets](brand-assets.md). Do not recolor, redraw, stretch, crop out the tagline, or add effects. The header fits its square canvas with `object-fit: cover` at 180×100 (144×80 on narrow screens).
- The logo appears once, in the platform header, linking home with the accessible name "Slice Consulting home".
- The product name in the interface is **Slice Consulting**; the launcher area is **App Launcher**. Individual apps use their catalog `name` from `app.json`.
- Do not add other organizations' marks, Syracuse University marks beyond what the supplied logo contains, or generated logos.

## Tokens

### Color

All interface text below meets WCAG 2.1 AA (4.5:1) on its intended background. Ratios were calculated for this profile from the hex values; recheck when you change a color.

| Role                      | Value     | CSS variable today | Use                                                         | Contrast                     |
| ------------------------- | --------- | ------------------ | ----------------------------------------------------------- | ---------------------------- |
| Page background           | `#faf9f6` | none (on `:root`)  | Whole-page background                                       | —                            |
| Surface                   | `#fffefb` | none               | Cards, tiles, empty states, secondary buttons               | —                            |
| Ink                       | `#292c30` | `--ink`            | Body text and headings                                      | 13.3:1 on page               |
| Muted text                | `#666962` | `--muted`          | Secondary text, notes, timestamps, inactive tabs            | 5.3:1 on page, 5.5:1 surface |
| Accent                    | `#a4461c` | `--accent`         | Primary action fill, current tab, text links, focus outline | 5.8:1 on page                |
| Accent hover              | `#853915` | none               | Primary button hover                                        | white text 8.1:1             |
| Accent tint               | `#fff0e3` | none               | App tile initial background                                 | accent text 5.4:1            |
| Line                      | `#e5e4df` | `--line`           | Dividers and card borders (decorative only)                 | 1.2:1, decorative            |
| Control border            | `#cfcec6` | none               | Text input and select borders                               | 1.6:1 — see known gaps       |
| Selected row              | `#f3efe7` | none               | Hovered or selected list row                                | —                            |
| Text selection            | `#ffd8b7` | none               | `::selection` background                                    | —                            |
| Notice                    | `#f6f3e9` | none               | Informational notice background, border `#ddd9c9`           | ink 12.6:1                   |
| Error notice              | `#fff0ea` | none               | Error notice background, border `#e9baa6`                   | ink 12.6:1                   |
| Status: neutral           | `#55594e` | none               | Badge text on `#eeeee8`                                     | 6.2:1                        |
| Status: active            | `#3c573b` | none               | Badge text on `#e8efe5`                                     | 6.8:1                        |
| Status: pending / invited | `#735124` | none               | Badge text on `#f5ebd9`                                     | 6.1:1                        |
| Status: suspended         | `#914833` | none               | Badge text on `#f6e6e1`                                     | 5.5:1                        |
| Launch button             | `#30372e` | none               | "Open app" on app tiles only; hover `#465140`               | white text 12.3:1            |

Rules:

- Use the CSS variable where one exists (`var(--accent)`, or `text-(--accent)` in Tailwind). Do not type a new hex value in a component.
- Never communicate meaning with color alone. Status badges always carry a word ("Active", "Pending").
- There is no dark theme. The platform declares `color-scheme: light`; do not add `prefers-color-scheme` styles in one app.
- Red is not a brand color. Errors use the error notice palette and clear words, not bright red text.

### Typography

Font stack, set once on `:root`: `"Avenir Next", Avenir, "Segoe UI", ui-sans-serif, system-ui, sans-serif`. Do not load web fonts or set another family.

| Element                   | Size | Weight  | Notes                                                    |
| ------------------------- | ---- | ------- | -------------------------------------------------------- |
| Page title (`h1`)         | 28px | 600     | 25px at ≤650px; line-height 1.25; letter-spacing -0.03em |
| Card heading              | 19px | 600     | `.account-card h2`                                       |
| Form legend               | 18px | 600     |                                                          |
| Tile heading              | 18px | 600     | `text-lg font-semibold tracking-tight`                   |
| Body and form inputs      | 14px | 400     | Long-form paragraphs use line-height 1.6                 |
| Labels, buttons, tabs     | 13px | 500–600 | Buttons and the active tab are 600                       |
| Notes, timestamps, footer | 12px | 400     | Muted color                                              |
| Badges                    | 11px | 500     | Sentence case word, rendered capitalized                 |

Rules: one `h1` per page, headings in order, sentence case everywhere ("Save access", not "Save Access"). Use `…` for in-progress text ("Loading activity…").

### Spacing, shape and layout

- **Spacing** uses this scale (px): 4, 8, 12, 16, 20, 24, 28, 32, 40, 56. Prefer 8, 12, 16, 20 and 24 inside components; 24–40 between sections.
- **Radii:** 6px badges · 7–8px inputs and buttons · 9px notices · 14px account cards and icon tiles · 16px app tiles and empty states · 50% avatars.
- **Borders:** 1px solid. No drop shadows, gradients or blur.
- **Shell:** content is centered with `max-width: 1440px` and 6% side margins in `.site-header`, `.workspace-main` and `.site-footer`.
- **Grids:** app tiles use `repeat(auto-fit, minmax(min(100%, 280px), 1fr))` with a 20px gap. Two-panel layouts (`.profile-grid`, `.management-grid`) collapse to one column at ≤800px.
- **Breakpoints:** 800px (two panels stack), 650px (smaller header and title), 500px (account header compacts, toolbars stack). Do not add others without a reason.
- **Touch targets:** buttons and inputs are at least 42–44px tall. Keep new interactive controls at 44px or larger.

## Page shell

Every page has the same frame:

```text
.workspace-shell
├── a.skip-link           "Skip to content" → #main
├── header.site-header    logo · divider · workspace label · AccountNav
├── main#main.workspace-main
│   └── section           h1, then content
└── footer.site-footer    "Slice Consulting" · project links
```

App modules render inside `main`. The host owns routing and the shell, so an app's `Page` returns content starting at its section, not its own header, footer or `<html>` structure. See [adding an app](adding-an-app.md).

Keep the launcher focused on Applications. **Connect your AI** belongs in the footer's `.project-links` beside the contributor resources, using the same muted, underlined text and 44px touch target. Its setup guide stays on a separate page; do not promote it with a banner above the apps.

## Components

Use these before creating anything new. Classes live in `platform/app/globals.css`; React components in `packages/ui/src`.

| Need                            | Use                                               | Notes                                                                                     |
| ------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Main action on a screen         | `.primary-button`                                 | One per view or form. Verb first: "Save access", "Add member".                            |
| Other actions                   | `.secondary-button`                               | Cancel, Refresh, secondary navigation.                                                    |
| Low-emphasis inline action      | `.text-button`                                    | "Reload latest changes", "Sign out". Underlined accent text.                              |
| App in the launcher grid        | `AppTile` from `@slice/ui`                        | Shows initial, name, description and "Open app", or "Coming soon" when there is no link.  |
| Grouped content                 | `.account-card`                                   | Surface, 1px line, 14px radius, 28px padding (22px on mobile).                            |
| Section switcher                | `nav.account-tabs` with `aria-current` on current | Accent underline on the current tab. Horizontal scroll, never wrapping.                   |
| Heading row with an action      | `.account-heading` or `.section-toolbar`          | Toolbar stacks at ≤500px.                                                                 |
| Forms                           | `.form-stack` with `fieldset` and `legend`        | Label wraps the control; hints use `.field-note`. Checkboxes use `.check-label`.          |
| Information the user should see | `p.notice` with `role="status"`                   | Calm background; keep it to one or two sentences.                                         |
| Something went wrong            | `.notice.error-notice` with `role="alert"`        | Say what happened and offer a next step such as a "Reload latest changes" `.text-button`. |
| Record status                   | `.status-badge.status-<state>`                    | States: active, pending, invited, suspended; neutral otherwise.                           |
| Person                          | `.member-avatar`, `.profile-avatar`               | Initial on `#f0e7dc`; decorative, so `aria-hidden="true"`.                                |
| Selectable list                 | `.member-list` with `button.member-row`           | `aria-pressed="true"` for the selected row.                                               |
| Nothing to show yet             | `.empty-catalog` pattern                          | Line icon in `.empty-icon`, one short heading.                                            |
| Waiting for data                | `<p role="status">Loading your account…</p>`      | Text, not spinners or skeletons.                                                          |
| History or audit entries        | `.activity-list`                                  | `time` in muted 12px; raw detail inside `details`.                                        |
| Icons                           | Inline SVG, 24px viewBox, 1.5px `currentColor`    | Decorative icons get `aria-hidden="true"`. Do not add an icon library.                    |

If a pattern you need is missing, build it once in the shared place, using the tokens above, and add a row to this table in the same PR.

## Voice and copy

Follow the [communication standard](../AGENTS.md#communicate-as-a-business-partner-and-teacher) in AGENTS.md: plain business language, outcome first.

- **Buttons** are verbs describing the result: "Open app", "Save access", "Add member". Avoid "Submit", "OK" and "Click here".
- **Headings** name the thing: "Applications", "Organization", "Recent activity".
- **Errors** say what happened and what to do next, without technical detail or private data, for example "We couldn't save these changes. Reload latest changes and try again." Never show stack traces, IDs from the database or raw provider messages.
- **Permission messages** say who can act: "An owner must make changes to this member."
- **Empty states** state the fact plainly: "No apps have been added yet", "No members found."
- Use synthetic names and emails in examples, screenshots and fixtures.

## Accessibility

Target WCAG 2.1 AA. The browser tests run axe with the `wcag2a`, `wcag2aa` and `wcag21aa` rules; passing them is required but does not cover everything below.

- Every page keeps the skip link and a single `main#main`.
- Every control has a visible label or an accessible name. Icon-only controls need `aria-label`.
- Focus is always visible: 3px `--accent` outline (offset 3px on controls, 6px on links). Do not remove outlines.
- Everything works with a keyboard in a sensible order. Use `button` for actions and `a` for navigation; no clickable `div`s.
- Announce changes: `role="status"` for progress and results, `role="alert"` for errors.
- Links that open a new tab say so to screen readers: `<span className="sr-only"> (opens in a new tab)</span>`.
- Do not rely on hover. Anything revealed on hover is also available on focus or tap.
- Keep motion to simple color transitions. Anything larger must respect `prefers-reduced-motion`.
- Decorative images and initials are `aria-hidden="true"`; meaningful images have specific `alt` text.

## Responsive behavior

- Design for 390px wide phones and 1280px laptops; check both before review.
- The page never scrolls sideways. Only tab rows and `pre` blocks may scroll horizontally inside themselves.
- Long names and emails wrap (`overflow-wrap: anywhere`) or truncate with an ellipsis where space is fixed, as in `AccountNav`.
- Two-panel screens stack at ≤800px; action rows stack at ≤500px.

## App modules

- Render inside the platform shell; do not add another header, logo, footer, theme or global stylesheet.
- Use the shared classes and `@slice/ui` components. App-specific styles stay in the app folder and use the tokens above.
- Do not add UI frameworks, component libraries, icon packs or web fonts without maintainer agreement.
- Public metadata in `app.json` (name and description) shows on the launcher tile. Keep the name short and the description to one plain sentence saying who it helps and how.

## Review checklist

Copy this into the PR's Validation section for any visible change, marking each item.

- [ ] Uses existing components and tokens; any new pattern is shared and added to this profile.
- [ ] No new colors, fonts, shadows, icon libraries or UI frameworks.
- [ ] Copy is plain, sentence case, verb-led on buttons; errors explain the next step and expose no private data.
- [ ] Keyboard-only walk-through done; focus is visible and in order.
- [ ] Labels, accessible names and `role="status"`/`role="alert"` are in place; `pnpm test:e2e` axe checks pass for covered screens.
- [ ] Checked at 390px and 1280px wide; no sideways page scroll.
- [ ] Screenshots at both widths attached, containing synthetic data only.

## Known gaps

These are real differences between today's code and this profile. Fix them in focused PRs; do not copy them into new work.

- **Hard-coded colors.** Most values above are typed as hex in `globals.css` and `packages/ui/src/app-tile.tsx` instead of CSS variables. New code should use variables; a follow-up should add the missing ones (for example `--page`, `--surface`, `--accent-hover`).
- **Form control borders are too faint.** `#cfcec6` on white is about 1.6:1, below the 3:1 that WCAG 2.1 asks for the boundary of an input. axe does not catch this. Darken the border in a dedicated PR and recheck screenshots.
- **App page shell is incomplete.** `platform/app/apps/[appId]/[[...path]]/page.tsx` renders a plain text header without the logo, skip link, `main` id or `AccountNav`. App modules should look like the launcher; the platform owner should bring this shell in line.
- **No automated design check.** CI checks accessibility rules with axe but does not check tokens or copy. Reviewers and this checklist carry that today.

## Changing this profile

Propose changes in a PR that updates this file, the affected CSS or components, and screenshots together. Explain the reason (for example, a contrast fix or a pattern two apps need). Brand changes, such as the logo, accent color or font, need maintainer agreement before implementation.
