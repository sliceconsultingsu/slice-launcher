# Anthropic skills for Slice

Three tools published by Anthropic, each for a specific job: designing a new interface pattern, checking a screen in a real browser, and guiding a feature from idea to review. Use them alongside [Superpowers](../superpowers/README.md), not instead of Slice's rules.

## Choose the tool for the job

The instruction links point to fixed upstream revisions so everyone starts from the same reference.

| Your situation                                                 | Instructions for the agent                                                                                                                               | What you should get                                                         |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| You need a screen pattern the design profile doesn't cover yet | [Frontend design](https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/frontend-design/SKILL.md)                    | A considered visual proposal, which you then fit to the design profile      |
| You want to see whether a screen works in a browser            | [Web app testing](https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/webapp-testing/SKILL.md)                     | Screenshots, browser logs and evidence of what a screen actually does       |
| You're building a feature end to end in Claude Code            | [Feature development](https://github.com/anthropics/claude-plugins-official/blob/ec6442f4283dd5b32fd714d057c16b3e50b10e1c/plugins/feature-dev/README.md) | Codebase exploration, clarifying questions, architecture options and review |

## Apply Slice's working rules

**Frontend design follows the design profile.** This skill pushes for distinctive, opinionated visual choices. That suits a new pattern, not an existing Slice screen. Use it only when the [design profile](../../docs/design-profile.md) has no component or pattern for what you need. Then bring the result into `packages/ui` and the profile in the same PR. It never overrides Slice's tokens, accent colour, font, logo or page shell.

**Web app testing is for exploring, not for committed tests.** It writes Python Playwright scripts against a running app. Use it to look at a screen, capture screenshots for a PR, or reproduce a bug. Run it only against your local `pnpm dev` server or the end-to-end harness, with synthetic data; never against production or real member records. Tests you commit stay in TypeScript under `platform/tests/e2e`, and `pnpm test:e2e` remains the required check. It needs Python with the `playwright` package installed on your machine.

**Pick one feature workflow per task.** Feature development and Superpowers both take a feature from idea to review. Use Superpowers when you want a written plan and test-driven steps; use `/feature-dev` for a guided, interactive run in Claude Code. Don't run both on the same task. Its review agents are advisory, like the AI reviewer: required checks and maintainer review still decide.

For all three:

- Explain the business outcome first and teach unfamiliar ideas simply, as required by [AGENTS.md](../../AGENTS.md).
- Keep Slice's shared login, permission checks, app structure and release process. A generic example in a skill is not a reason to replace them.
- Follow your tool's limits on extra agents, network access and approvals. Feature development starts additional agents; that does not override those limits.
- Use synthetic examples, and follow [data boundaries](../../docs/data-boundary.md) before sending anything to an external tool.

## Give your agent access

Any agent that can read linked files can follow the instructions above directly. That is explicit use; it doesn't install anything.

To install them in Claude Code:

```text
/plugin install frontend-design@claude-plugins-official
/plugin install feature-dev@claude-plugins-official
```

Web app testing is published only as part of Anthropic's `example-skills` bundle, which also installs eleven other skills:

```text
/plugin marketplace add anthropics/skills
/plugin install example-skills@anthropic-agent-skills
```

If you don't want the whole bundle, have your agent read the linked instructions instead. `/feature-dev` exists only in Claude Code; other tools can read its linked instructions but not run the command. Installation is separate for each person's tool. Keep personal installation files outside this repository. An installed plugin may be newer than the reference here: record which version you used when it affects the work.

To check setup, ask:

> Which Anthropic skill will you use for this task, and why? Open its instructions and tell me where you loaded them from. If it's frontend design, tell me how the result will fit the design profile.

An agent should name the file or source it actually read. If it can't access the instructions, it must say so and continue under AGENTS.md. It must not claim a skill is installed or in use just because this page exists. Installation has not been verified in every contributor's tool.

## Source and maintenance

Reference added October 15, 2026:

- [`anthropics/skills` at `dbd4588`](https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44): `frontend-design` and `webapp-testing`, each under the Apache License 2.0 in its own `LICENSE.txt`.
- [`anthropics/claude-plugins-official` at `ec6442f`](https://github.com/anthropics/claude-plugins-official/tree/ec6442f4283dd5b32fd714d057c16b3e50b10e1c): `feature-dev` and the `frontend-design` plugin, under the Apache License 2.0.

This folder contains Slice's integration guide, not a copied distribution or an installed plugin. No application dependency or production setting is added. When updating the references, check the changed instructions against AGENTS.md and the design profile, and update the links together in a reviewed PR.
