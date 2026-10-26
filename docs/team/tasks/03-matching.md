# Task 3: Explain one example student–alumni match

**Owner:** person 3, pending assignment. **Depends on:** starter only.

## Outcome

Given a fictional student, return alumni whose industry matches a stated interest, with a clear reason for every result. This is a learning rule, not an approved final matching algorithm.

## Scope

Create `platform/apps/alumni/matching/recommend.ts` and `recommend.test.ts`. Implement `recommendMatches(student, alumni)` from [shared contracts](../../../platform/apps/alumni/README.md#common-interfaces). Use the existing types; no API, new dependency, network call, model provider or UI change in this first PR.

## Acceptance examples

- Casey Example's Consulting interest returns Alex Example, with a reason identifying Consulting.
- Interests match case-insensitively after trimming; repeated interests do not duplicate alumni.
- No overlap or an empty alumni list returns an empty array, not an unrelated fallback match.
- Results have stable alumni-ID ordering and do not mutate either input.
- There are no invented confidence percentages and no claim of availability or willingness to mentor.

Run `corepack pnpm --filter @slice/launcher exec vitest run apps/alumni/matching/recommend.test.ts`. Demonstrate a match and a no-match example. Run the full contributor checks and open a PR.

**Later:** agree criteria with Maya, evaluate realistic scenarios, add results UI, then expose the same function through API and MCP. Pairing limits and actual outreach are separate decisions.
