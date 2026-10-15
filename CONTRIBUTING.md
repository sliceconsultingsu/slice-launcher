# Contributing to Slice

You do not need to understand the whole platform to contribute an app. Start with a small, agreed task and work in that app's folder. You are responsible for the changes you submit, including work produced by an AI agent.

## 1. Find the right place

- **App features:** `platform/apps/<app-name>/`. Start with [the apps folder](platform/apps/README.md).
- **Login, permissions, shared MCP or launcher behavior:** `platform/src/` and `platform/app/`.
- **Shared visual components:** `packages/ui/`.
- **Shared development rules:** `packages/config/`.
- **Guides:** `docs/`.

See the [repository map](docs/repository-map.md) for the configuration files and who owns them. Ask the maintainer when a task changes access rules, private data or production infrastructure.

## 2. Prepare your workspace

Use the Node/pnpm versions in [README.md](README.md), then run:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Create a feature branch before editing. Keep other contributors' changes. If you need a new app, run this from the repository root:

```sh
pnpm app:create alumni "Alumni directory"
```

The command creates its folder, app settings, starter screen and README. Follow [adding an app](docs/adding-an-app.md). Edit that app's `app.json` to change its public name or declared permissions, then run `pnpm apps:sync`. Generated catalog/import files are not edited by hand. Every app inherits the platform's sign-in, permission checks, MCP adapter and deployment.

## 3. If you use an AI agent

Choose **Claude Opus 5.5** or **GPT-6 Astra**. Set reasoning to **High** while planning, then **Medium** while implementing the agreed work. Prefer these over weaker models for code changes; the aim is to reduce mistakes that break existing features. Model choice does not replace tests or your review. See [the model guidance](AGENTS.md#recommended-models-and-reasoning-settings) for exceptions and difficult tasks.

Have it read [AGENTS.md](AGENTS.md) and the guides linked for your task. Claude can discover the [CLAUDE.md](CLAUDE.md) pointer; other agents may need this instruction pasted into their task:

> Read AGENTS.md and the skills guide. Explain the business outcome first and teach me any technical concepts in simple language, using small examples. Implement this task within the repository rules, test the result, and explain what changed, what remains uncertain and whether it is live.

Your agent should work like a patient teacher: explain why a change matters, introduce one idea at a time and help you make informed decisions. You can ask it to explain more simply or show an example. Start with [agent skills](skills/README.md); the first collection is [Superpowers](skills/superpowers/README.md), which helps an agent plan, investigate problems and check its work.

Review the plan and diff yourself. Never give an agent production credentials or private member/client data. A passing test or AI review does not replace your responsibility to understand what changed.

## 4. Implement and check

Keep app-specific code, settings, tests and documentation together. Use the shared module contract; validate inputs and enforce record-level access. Declare restricted actions and test that unauthorized users cannot perform them. See [architecture](docs/architecture.md), [membership](docs/membership.md), [MCP tools](docs/mcp.md) and [data boundaries](docs/data-boundary.md) as applicable.

Run these from the repository root before requesting review:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:migrations
pnpm --filter @slice/launcher exec playwright install chromium
pnpm test:e2e
pnpm build
pnpm smoke:launcher
```

These check formatting, code rules/types, behavior and permissions, database changes, browser flows, and the actual Worker build. Use `pnpm format` to fix formatting. If a check fails, fix the cause; do not disable it. Explain any check you could not run. For visible changes, test desktop/mobile and accessibility, and include screenshots containing synthetic data only.

Update the app README and affected current guides when behavior changes. Use the [documentation index](docs/README.md); historical plans and experiment reports are evidence, not setup instructions.

## 5. Submit a pull request

Push your branch and open a PR into `main`. Explain the problem, what now happens, tests actually run, remaining limitations and deployment effects. Include app permissions or data changes so the reviewer knows what to check.

Ivan reviews other contributors' PRs; his own need no independent approval. Required CI and resolved review conversations apply to everyone. The [AI reviewer](docs/ai-review.md) posts in the PR conversation, but cannot approve or merge. Incomplete or unavailable review is not a clean review.

After an authorized merge, all apps build and release together. Follow [deployment guidance](docs/deployment.md) for production settings, migrations and rollback. Report pushed, merged and deployed as separate states.

## Reporting a problem

For an ordinary bug, open a GitHub issue with what you expected, what happened and steps to reproduce; use synthetic examples. For a vulnerability, use GitHub private vulnerability reporting when available, or contact the maintainer privately before publishing details. Never put credentials, private exports or real client records in an issue or PR.
