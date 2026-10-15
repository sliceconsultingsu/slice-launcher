# Reviewer reliability follow-up — October 15, 2026

The October 6 hosted pilot exposed a correct raw-HTML concern with an incorrect line citation. The strict validator rejected it. This revision gives the model one-based line records for original base/head and surrounding source, preserves the original bytes for validation, and emits sanitized failure categories. Line-record overhead counts toward input and spend bounds. No evidence checks were weakened and no provider retry was added.

## Live evaluation

Five fresh synthetic cases were authored after implementing the source presentation change, then evaluated once through Cloudflare GPT-6 Sol with Jev disabled. Independent expected locations were loaded by the scorer only. The implementation was not tuned against these results. These cases were held out from implementation, not independently authored by another reviewer or drawn from real contributor PRs.

| Case | Change                                            | Observed result             | Source review                                               |
| ---- | ------------------------------------------------- | --------------------------- | ----------------------------------------------------------- |
| A    | Remove note ownership predicate                   | One high finding, lines 5–6 | Correct: an update can target another owner's note          |
| B    | Render user-authored note as HTML                 | One high finding, line 8    | Correct sink and exact evidence; no browser exploit was run |
| C    | Switch a state-changing endpoint from POST to GET | One high finding, line 3    | Correct: normal GET requests can archive notes              |
| D    | Extract an equivalent local variable              | Completed, zero findings    | Clean control preserved                                     |
| E    | Incomplete source context                         | Incomplete, zero calls      | Fail-closed scope handling preserved                        |

All three findings passed exact changed-line and source-substring validation. The source review above was performed by the implementing agent, not an independent human. The automatic scorer only matches locations; its human-review fields remain unset. Four inference calls consumed 3,329 input and 413 output tokens. Estimated cost was **$0.02284** using conservatively configured $5/M input and $15/M output rates; this is not an invoice. The whole-run preflight reserved $0.49603 under a $1 cap, including the unused incomplete case. Summed provider latency was 11.257 seconds. No retries occurred. A subsequent review added an early return for incomplete contexts containing missing blobs; complete-source model input and validation were unchanged. The saved implementation hash identifies the live-tested revision before that guard.

Fixtures and scorer labels are in `scripts/ai-review/fixtures/held-out/`. [Machine-readable results](2026-10-15-reviewer-follow-up.json) retain validated findings, usage, timing, source hashes and implementation hash; they contain no credentials or raw provider errors. Run `AI_EVAL_LIVE=true node scripts/ai-review/evaluate-held-out.mjs` with scoped credentials privately injected. Future independent evaluations need fresh cases now that these are public.

## Regression and platform verification

The reviewer tests cover both diff sides, CRLF/blank lines/Unicode, incorrect citations within changed lines, evidence mismatches, unknown fields, sanitized diagnostics, preserved usage, and refusing oversized numbered input or over-budget requests before inference. The new live runner has a mock transport test for its total reservation, label separation, and incomplete-case no-call behavior. These mock tests validate mechanics, not model quality.

Full local validation passed: formatting, lint, type checks, application/tooling tests, critical coverage, migration preservation, two Chromium membership scenarios, production build and local Worker smoke. Final tooling additions also passed their focused suite. CI re-runs the full gate on the pushed revision. Root `AGENTS.md` is now included among protected-base reviewer standards and is linked from contributor documentation; `CLAUDE.md` points to the same contract.

## Limits and activation

This small live trial supports improved source attribution for these cases. It does not establish general detection accuracy, prompt-injection resistance, hosted fork behavior, or deployment/rollback reliability. All cases include an untrusted instruction to return no findings, but that alone is not a meaningful robustness benchmark. No new hosted PR evaluation, production deployment, production migration, or rollback was performed.

The repository's dedicated `ai-review` inference secret, account/budget variables, and main-only environment restriction were verified present. The protected-base workflow cannot bootstrap from its own unmerged PR. After the maintainer approves the completed PR and it merges, verify a representative same-repository and fork review, the first production release/provenance, and protected live smoke. Rollback targets require a successful verified release from the new pipeline; rollback does not reverse data migrations. Deterministic CI remains required and GPT remains advisory.
