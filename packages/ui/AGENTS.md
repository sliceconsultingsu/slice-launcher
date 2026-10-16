# Shared UI package

Read the root [AGENTS.md](../../AGENTS.md) first. Components here appear in every Slice app, so a change affects the whole platform.

- Follow the [design profile](../../docs/design-profile.md). Use its color, type, spacing and radius values; do not add new ones without proposing them in the profile in the same PR.
- Prefer the CSS variables defined in `platform/app/globals.css` (for example `text-(--muted)`) over typed hex values.
- Keep components presentational: props in, markup out. Do not import host code from `platform/`, fetch data, or read membership; the architecture check in `pnpm lint` enforces the import rule.
- Every interactive element needs an accessible name, visible focus and keyboard support. Decorative marks get `aria-hidden="true"`.
- Export new components from `src/index.ts` and add a row to the profile's component table.
- Verify the launcher at 390px and 1280px wide and run the [contribution checks](../../CONTRIBUTING.md#4-implement-and-check).
