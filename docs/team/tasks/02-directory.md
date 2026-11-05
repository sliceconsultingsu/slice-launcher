# Task 2: Filter the directory by industry

**Owner:** person 2, pending assignment. **Depends on:** starter only.

## Outcome

A student can narrow the fictional alumni directory to an industry and return to the complete list.

## Scope

Work in `platform/apps/alumni/ui/`. Add an accessible industry selector to the existing directory. Derive choices from loaded records; do not hardcode industries in the UI. Keep the shared API and schemas unchanged. A focused UI helper test can live beside the component. Add a separate `platform/tests/team/directory-filter.spec.ts` for browser behavior; coordinate changes to shared test configuration with Ivan.

## Acceptance examples

- “All industries” initially shows all three sample alumni.
- “Technology” shows Jordan Sample, with no Consulting or Finance profiles.
- Returning to “All industries” restores all three.
- Empty data, failed loading/retry and a selection no longer present after reload remain understandable.
- The control has a visible label, works with a keyboard and does not cause horizontal scrolling at 390px width. Student cards are unchanged.

Run `corepack pnpm test:team`, demonstrate the filter, attach desktop/mobile screenshots of fictional data, and run the full contributor checks before opening a PR.

**Later:** alumni detail/editing and student intake. Those require agreed edit permissions and student identity rules.
