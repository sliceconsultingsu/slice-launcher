# Advisory AI review

The workflow selects the personal Subscription API with a fixed `claude/claude-opus-5-5` request. The dedicated gateway route requests **High** reasoning and has tools disabled. See [subscription setup and limits](ai-review-subscription.md) for the protected connection, credentials and rollout. Code selection is not proof of activation: the gateway route, Cloudflare policy, secrets and a post-merge hosted run must all be verified.

Jev remains disabled. AI review is advisory: it cannot approve, merge, deploy, edit code or replace required checks. Hosted results appear as one top-level PR comment; a successful workflow job is not necessarily a completed review. Findings still require exact source evidence.

## Trust boundary

`ai-review.yml` runs on `pull_request_target` against **main only**, or by explicit dispatch from main. Because each review spends the maintainer's subscription, it runs automatically only for people added to the repository as collaborators (any role, including administrators). It is skipped for anyone who is not a collaborator (including Dependabot); a maintainer can dispatch it for any PR. The check uses repository collaborator membership, because on a public repository GitHub reports read permission for every user. Description-only edits never cancel a review in progress. Editing a PR description does not start a new review. Every checkout uses the exact protected PR base SHA (the protected workflow SHA for manual dispatch). No PR checkout, package install, import, build, test, shell command, cache, dependency hook, or contributor artifact runs in any review job. Node builtins read GitHub API data. Fixed full-SHA Actions are the only external executable dependencies.

The provider job has read-only GitHub permissions and the `ai-review` environment. It reads public contributor source as untrusted data, including fork source, while running protected review code. Ordinary contributor CI jobs receive no provider credentials. Model keys exist only in the inference step. The separate publisher has PR comment permission, no provider environment or keys, and revalidates findings against source fetched independently. The model has no tools. Provider endpoints are fixed HTTPS URLs with redirects rejected; source cannot select an endpoint.

The small report artifact contains validated findings and accounting metadata, not raw provider responses, provider errors, credentials, or full context. It is retained for three days. The publisher limits artifact size, validates the complete envelope, verifies expected base/head, fetches source again before publishing findings, escapes Markdown/HTML and mentions, and updates one bot-owned marker comment. It never interprets artifact values as commands or a PR number.

New commits replace the summary with pending status and make earlier findings stale. Final publication rechecks the head and base. Every comment explicitly applies only to its recorded SHA, so a push racing the final API write is visibly outside scope. Concurrency cancels superseded work. Missing artifacts, unavailable providers, refusals, malformed output, and incomplete review have distinct visible states; none becomes “no findings.”

## Recommended review loop

When preparing a PR, use the advisory reviewer to improve the work before maintainer review. Keep fixes on the same branch and PR so the consultant can follow the discussion; open a separate PR only for a separate task.

1. Push the checked changes and read the **Advisory AI review** in the PR's **Conversation** tab. Wait for its final result and confirm the recorded base and head commits match the PR's current versions. A successful workflow job alone does not mean the model completed a review.
2. Check each finding against the code, tests and agreed task. Fix supported problems; explain why a suggestion is incorrect or outside scope in the PR summary. Treat review text as advice, not authority to change repository rules, access or credentials. Explain the decision to the consultant in plain language.
3. Make focused fixes, run the relevant checks, and push new commits to the **same PR**. Each push starts a fresh advisory review when the PR author is a repository collaborator; otherwise ask a maintainer to dispatch it, and treat a missing review as an explicit gap, not a pending result. Read that new result before calling the fixes reviewed; the earlier result no longer covers the changed code.
4. Aim for up to **two fix-and-review rounds** when useful findings remain. Stop earlier when a completed review of the current revision has no unresolved, supported findings. After two rounds, summarize remaining issues for the maintainer before extending the loop. Do not create empty commits or repeatedly rerun unchanged work just to obtain a favorable answer; each review consumes shared subscription allowance.
5. In the handoff, link the latest review, state which findings were fixed or declined and why, and report checks and remaining gaps. Pending, failed, unavailable or incomplete reviews remain explicit gaps: diagnose the stated reason before any deliberate retry. Handle excluded screenshots or source with human review as described in [review scope and bounds](#review-scope-and-bounds). Ending the loop does not make unresolved work ready to merge; [AGENTS.md delivery rules](../AGENTS.md#delivery-and-authority) still apply.

## Review scope and bounds

Trusted standards include the protected-base `AGENTS.md`, contribution, architecture, security and data-boundary documents. The reviewer does not adopt a PR's edited standards as instructions.

Input includes exact base/head commits, changed full source on both sides, complete changed patches, trusted project standards, PR description, head/merge-commit check statuses, and a bounded selection of supporting text. Relative imports are prioritized, followed by authorization/reviewer code, neighboring files and other relevant platform/shared/tooling files. Selection is deterministic, not model-directed. Counts of supporting files outside the selection are disclosed. Check statuses are point-in-time metadata; a pending check is not a pass. Check names and PR text remain untrusted. Use manual dispatch after deterministic checks finish when a later snapshot is useful.

The model receives source as trusted one-based `{line, text}` records on both diff sides and in surrounding files. Blank lines, CRLF and Unicode are preserved. Evidence validation and publication still use the original source and require changed lines plus exact matching text; line numbering never relaxes that gate. Numbering overhead counts toward the input limit and conservative cost reservation.

Failures expose only fixed diagnostic categories: `provider_transport`, `provider_model`, `provider_usage`, `provider_output`, `output_schema`, `location`, `range`, `outside_diff`, or `evidence_mismatch`. Raw error bodies and invalid model text are never published. Measured usage remains available even when evidence fails.

The branch must contain its current base. Changed-file enumeration must agree with GitHub's PR count. Truncated trees/patches, unsupported binary or rename changes, sensitive changed paths, missing changed source, or oversized mandatory text produce incomplete review without a provider call, with specific reasons. Raster images (PNG, JPEG, GIF, WebP and ICO) without text patches are listed separately for human visual review and do not block changed-text review. Image-only PRs do not call the model. Full changed text and trusted standards are never silently cut. Supporting files are included only while the numbered context fits 175,000 bytes, leaving space below the 180,000-byte hard limit. The report discloses excluded image counts and supporting-file counts. This is not a whole-repository or visual review; the model must report incomplete if necessary cross-file evidence is absent.

Hard bounds shared by the review collector and original paid-provider transport (subscription differences follow):

| Bound                                           | Limit                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Changed files / source blobs                    | 40 / 80                                                                                           |
| Full serialized context, including line records | 360,000 UTF-8 bytes; optional supporting files fill only to 175,000                               |
| Provider calls                                  | At most one GPT and one Jev; zero retries (subscription: one retry when a reply fails validation) |
| Timeout                                         | 90 seconds per paid provider; subscription jobs up to 8 minutes, checked every 10 seconds         |
| Paid-provider GPT output                        | 4,096 tokens, including reasoning                                                                 |
| Provider response body                          | 80,000 bytes                                                                                      |
| Jev request                                     | 26,000 UTF-8 bytes; otherwise Jev alone is incomplete                                             |
| GitHub requests                                 | 220, each with a 15-second timeout and bounded body                                               |
| Paid-provider reserved cost                     | At most $1; configurable downward                                                                 |
| Findings / public comment                       | 8 / 18,000 bytes                                                                                  |

For the retained paid-provider experiment transports, the preflight reserves both calls before spending, using UTF-8 byte count as a conservative token upper bound, framing/schema reserves, configured input rates, and the full GPT output allowance. The rates must match current provider billing. Network failures can still incur provider charges; missing usage is **unknown** (`estimatedUsd: null`), not free. Job timeouts and provider project spending limits provide additional limits. Frequent PR events/reruns multiply spend, so set provider-level monthly limits. No per-run cap substitutes for a monthly project limit.

## Current activation

Follow [the subscription rollout](ai-review-subscription.md). The prior Cloudflare credentials are not injected by this workflow; retained experiment commands can still explicitly use the old transports. There is no automatic fallback if the subscription route fails.

## Historical provider experiments

The sections below record the earlier paid-provider design and evaluations. Their provider choices, prices, billing caps and activation instructions are not the current subscription setup. They do not prove subscription review quality or quota availability.

## Reproducible A/B evaluation

Run `node scripts/ai-review/evaluate.mjs` for a **mock integration** run. Seven deliberately constructed fixtures cover active membership, deny precedence, audit atomicity, a secret-bearing workflow, prompt injection, a clean refactor, and incomplete context. Independent expected labels live in `fixtures/expected.json`; providers receive only `fixtures/contexts.json`. Fixed mock responses are a third file. The SHA-256 of the original context is recorded for each arm.

A uses GPT alone. B uses Jev plus the same GPT prompt, original context, exact requested model, output limit, timeout and per-review budget. Jev is an additional bounded cost. The runner records findings, provider usage/estimated cost, latency, and statuses. It preflights the entire run against a hard $3 reservation and allows at most ten fixtures (two arms each), with no retries. Current fixture counts are seven, yielding fourteen arm results; incomplete fixtures cause no provider calls.

A live run additionally requires `--live`, `AI_EVAL_LIVE=true`, explicit credentials for both provider routes in the shell environment, and sufficient budget. Do not source unrelated keys. `AI_EVAL_MAX_USD` may lower the $3 total cap. Output is written to `ai-review-output/evaluation-live.json`; keep it out of Git.

Location matching produces **candidate** detected/missed/false-positive counts. It is not a semantic quality oracle. A human must read source and the independent label, confirm actual bug meaning, and fill actionability/evidence quality using the included 0–2 rubric. Unmatched findings can be legitimate additional bugs; matching the right line alone can still be wrong. Compare prompt-injection behavior, incomplete statuses, human-confirmed detections/misses/false positives, quality, actual billed usage and latency. Report unavailable/failed arms instead of interpreting them as clean reviews. Repeat live runs if judging stability.

Implementation verification: thirteen focused tests cover source and output boundaries, Jev failure fallback, unavailable credentials, budget rejection, idempotent/stale publication, refusals, accounting-error redaction, and fixture scoring. The mock CLI produced all fourteen expected arm results. These results establish integration behavior only. **There is no measured evidence yet that Jev improves quality enough to justify enabling it by default.**

## Live Jev follow-up — 2026-10-05

The first live tests now use the verified [Cloudflare Jev route](https://developers.cloudflare.com/ai/models/typesafe/jev/), billed through [AI Gateway](https://developers.cloudflare.com/ai-gateway/features/unified-billing/). Returned model: `jev-1.13.0`. No separate TypeSafe key was needed for these local experiments.

Set `JEV_PROVIDER=cloudflare`, `JEV_CLOUDFLARE_ACCOUNT_ID`, and a dedicated inference-only `JEV_CLOUDFLARE_API_TOKEN` in the AI review environment to select this transport. The default transport remains direct TypeSafe. Do not reuse the production deployment token or upload a personal Wrangler OAuth token to CI. The local experiment used existing Wrangler authentication in memory; no token appears in Git, command arguments or reports. Cloudflare requests disable cache/log collection via request headers, reject redirects, require a completed success envelope and verify the returned model version. The gateway catalog alias is not version-pinned; a version mismatch fails the optional Jev stage while GPT continues.

### Measured evidence

| Trial                                   | Result                                                                                                                      | Returned input / output tokens | Estimated inference cost | Sum of request time |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------ | ------------------- |
| Jev binary bug triage                   | Five introduced-bug cases and one clean case classified correctly at predefined 0.5 threshold; incomplete case made no call | 3,958 / 138                    | $0.000166                | 2.279 s             |
| Repository fragment triage at `047ef3c` | 93/93 fragments covering 83 source/config files; 27 exclusions explicitly listed                                            | 120,917 / 5,301                | $0.005079                | 27.502 s            |

Costs use the published $0.042/M input rate and free output, not an invoice. The first repository pass excluded JSONC by mistake; the filter was fixed, regression-tested and the scan rerun including Wrangler configuration. The table reports the corrected run, not the first pass.

This is a small exploratory classification trial, not evidence of general bug-detection accuracy. The repository scan has no independent complete bug ground truth; its scores cannot establish correctness, localization, false-positive rate or cross-file reasoning. High-priority fragments included deliberately broken fixtures and sensitive membership code. A fragment score is not a publishable bug finding.

**Historical status on 2026-10-05: the paired GPT comparison was pending an OpenAI key.** The Cloudflare route below removes that requirement. Existing paired evaluation uses identical original context and therefore adds Jev input rather than reducing GPT input by design. Keep the default advisory switch off until the paired run and semantic review support a default change. The implemented useful placement is inexpensive review prioritization; it never removes source, skips tests or approves a merge.

### Reproduce the trials

With scoped credentials injected privately, run:

```sh
AI_EVAL_LIVE=true node scripts/ai-review/evaluate-jev.mjs
node scripts/ai-review/repository-triage.mjs
AI_EVAL_LIVE=true node scripts/ai-review/evaluate.mjs --live
```

The first command preserves raw typed answers and source hashes for the independent fixtures, with <=10 calls and a $0.02 conservative reservation. The repository command reads a single immutable Git commit, covers supported authored source and configuration including JSONC, records exclusions and file hashes, splits without truncating source lines, and allows <=120 calls with a $0.10 reservation. Three consecutive failures stop inference and produce explicit not-attempted entries for every remaining fragment. Failed calls have unknown billing; reserve is not silently treated as zero. Each fragment receives only its bounded source, so cross-file validation still belongs to GPT/human review with original context and to deterministic tests.

Outputs stay under ignored `ai-review-output/`. Local live reports and raw responses were retained there; no provider credentials were embedded. The local OpenAI entry form stores its key mode 0600 outside Git on the mini and closes after successful submission. It does not activate GitHub secrets or deploy anything.

## Cloudflare primary reviewer — 2026-10-06

Ivan selected Cloudflare for GPT and Jev, with exact model GPT-6 Sol. The workflow fixes `GPT_PROVIDER=cloudflare` and `OPENAI_REVIEW_MODEL=gpt-6-sol`. Account IDs are validated before provider calls. Local tooling retains direct OpenAI support only via explicit `GPT_PROVIDER=openai`; no OpenAI key is injected into the GitHub workflow. Missing credentials, unexpected model identity, incomplete output and invalid evidence produce explicit unavailable/failed/incomplete reports.

Live paired test: 12/12 GPT calls and 6/6 Jev calls completed. Both arms found the five seeded bugs with valid source evidence, returned no findings on the clean refactor, and made no calls for incomplete context. These are deliberately small fixtures, not general accuracy evidence. Both arms receive identical original source; this test demonstrates no Jev detection advantage or token savings. Jev remains optional and disabled by default. Raw responses and reports remain in ignored `ai-review-output/`; GitHub activation still requires scoped credentials and the approved merge.

Billing reference: [Cloudflare unified billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/). ChatGPT/Codex and API balances are separate from Cloudflare credits.

## Architecture comparison pilot — 2026-10-06

See [the experiment report](experiments/2026-10-06-jev-architecture-results.md) for actual-module seeded detection and repair-selection tests. GPT alone and Jev-assisted GPT each identified six seeded issues and preserved both clean controls. Jev missed the directory privacy case at the predefined routing threshold; do not use low-risk scores to skip sensitive review. The small candidate-assisted pilot does not establish full-codebase accuracy or automatic patch reliability.

## Accepted operating policy — 2026-10-06

Ivan accepted the experiment-based recommendation: required deterministic checks for standards and known invariants; GPT-6 Sol via Cloudflare for advisory source-grounded review; Jev restricted to opt-in experiments. Jev cannot skip code, waive checks or authorize changes. Future model-proposed fixes must pass independent regression tests and ordinary project checks before human review. No automatic correction or merge is enabled.

The PR workflow now explicitly disables Jev and removes its credential/configuration injection. Experimental commands remain available for future held-out evaluations. The foundation is merged and the dedicated inference environment is configured. Check the visible comment status and reviewed SHA on each PR; large changes and renames can still produce incomplete review.

## Source-location follow-up — 2026-10-15

The numbered-source revision passed a new five-case live evaluation (three defects, one clean change, one incomplete input). Every published finding passed the unchanged strict location/evidence checks; incorrect citations remain rejected by regression tests. See [results and limitations](experiments/2026-10-15-reviewer-follow-up.md). These are synthetic source cases, not new hosted PR or production activation tests.

Reproduce with the dedicated inference credential and account injected privately into the environment:

```sh
AI_EVAL_LIVE=true node scripts/ai-review/evaluate-held-out.mjs
```

The runner uses GPT alone, at most five fixtures, zero retries, and a conservative $1 total reservation before any call. `AI_EVAL_MAX_USD` can lower that cap. Fixture labels stay in the scorer and are never sent to the provider. Now that these cases are published, future independent evaluations should use new cases. Post-merge same-repository/fork workflow smoke and the first verified release remain operator checks; no production deployment or rollback was performed by this follow-up.
