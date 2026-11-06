# Front page evidence

What signed-out visitors see at `/`: the Slice logo in the header, a "Slice Consulting" heading and the Google sign-in card.

- [Desktop](front-page-desktop.png), 1280 × 960.
- [Mobile](front-page-mobile.png), 390 × 844.

Captured November 5, 2026 by `platform/tests/e2e/front-page.spec.ts` in the local synthetic browser harness; no member data is shown. The same test checks accessibility (axe, WCAG 2.1 AA) and that neither width scrolls sideways. To reproduce, run `pnpm test:e2e` and look in `platform/test-results/` for `front-page-*.png`.
