# Account role screenshots

Synthetic browser-test accounts; no production member data. These images show the role-label fix and the ordinary Member view.

- [Owner, desktop](owner-desktop.png): Admin (owner), with administration controls.
- [Owner, mobile](owner-mobile.png): the same role at a 390px viewport.
- [Ordinary Member](member-desktop.png): Member, with no access-level or activity controls.

Source: `platform/tests/e2e/membership.spec.ts`. Run `pnpm test:e2e`; screenshots are written beneath `platform/test-results/`. Copy reviewed outputs here when intentionally updating this UI evidence. These screenshots are documentation artifacts, not pixel-comparison baselines.
