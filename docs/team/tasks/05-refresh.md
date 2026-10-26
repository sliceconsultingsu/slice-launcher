# Task 5: Propose an alumni update without overwriting data

**Owner:** person 5, pending assignment. **Depends on:** starter only.

## Outcome

Compare one fictional incoming update to an existing alumni record and show a reviewable proposal, including where it came from. The first task does not scrape websites, schedule work or write records.

## Scope

Create `platform/apps/alumni/refresh/propose.ts` and `propose.test.ts`. Implement `proposeRefresh(current, candidate)` from [shared contracts](../contracts.md). Define a strict candidate schema with exact alumni ID, HTTPS source URL, ISO retrieval time and bounded optional company/role/industry/expertise fields. Use reserved `example.test` URLs in tests. Do not modify shared schema, storage or deployment files.

## Acceptance examples

- A valid changed role for the same alumni ID produces `status: "needs-review"`, the changed field, source URL and retrieval time.
- Equal values return null and repeated identical comparisons return the same proposal.
- A different ID is rejected even when the names match. Unknown fields, malformed dates and unsafe URLs are rejected.
- The original record remains unchanged; no network calls or writes occur.
- Arrays are compared by the documented rule; irrelevant input ordering must not create misleading changes.

Run `corepack pnpm --filter @slice/launcher exec vitest run apps/alumni/refresh/propose.test.ts`. Demonstrate changed, unchanged and wrong-person examples, then run the full contributor checks and open a PR.

**Later:** approved sources, identity resolution, a runner, retries/run history, scheduling and reviewed writes. Ivan owns any required shared scheduler extension. A live bot must preserve verified manual values and apply the agreed uncertain-change policy.
