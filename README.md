<img src="platform/public/brand/slice-logo.png" alt="Slice Consulting — Syracuse University" width="320" />

# Slice Consulting platform

One home for Slice Consulting's internal tools. Consultants sign in once; each tool uses the same account, permissions and release process.

**Live app:** [slice-launcher.ivan27chen.workers.dev](https://slice-launcher.ivan27chen.workers.dev) — sign in with your approved Slice account.

**Building an app? Start in [platform/apps/](platform/apps/README.md).** Each app gets its own folder there. The shared login, launcher and administration live elsewhere in `platform/`.

## Start here

| I want to…                             | Go to…                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Use the platform                       | [Open Slice](https://slice-launcher.ivan27chen.workers.dev) and sign in with your approved account |
| Understand the folders                 | [Repository map](docs/repository-map.md)                                                           |
| Build or change an app                 | [Contributing](CONTRIBUTING.md), then [add an app](docs/adding-an-app.md)                          |
| Work with an AI coding agent           | Ask it to read [AGENTS.md](AGENTS.md) first                                                        |
| Understand roles and access            | [Membership guide](docs/membership.md)                                                             |
| Connect an approved AI client          | [Connect your AI](docs/connect-your-ai.md)                                                         |
| Find technical or operational guidance | [Documentation index](docs/README.md)                                                              |

## Recommended AI models

Use **Claude Opus 5.5** or **GPT-6 Astra**, with **High** reasoning for planning and **Medium** for implementation. Avoid weaker models for code changes to help reduce the risk of breaking existing features. Every change still needs tests and review. See [the shared model guidance](skills/models.md), including what to do if a model is unavailable.

## Skills for your AI agent

Your agent should explain work in clear business language and help you learn as you go. [AGENTS.md](AGENTS.md) sets that standard. The [skills section](skills/README.md) gives your agent reusable work guides, starting with **Superpowers** for planning, solving problems and checking results. Follow its setup guide; adding a link does not install skills in your tool.

## What is ready?

The launcher, member approval, access levels, activity history, shared app routes, shared MCP adapter and CI/deployment pipeline are implemented. **There are no business apps yet**; the alumni directory is planned, not built.

An ordinary Member can view the member directory by default. Admin permissions come from ownership or explicitly assigned permissions. Owners have full admin access even if their **base access level** is called Member. The account screen distinguishes the effective organization role from that base level. See [how access works](docs/membership.md).

Remote MCP clients use consultants' own identities and permissions. Live client use requires Cloudflare managed OAuth activation and a real sign-in check; a successful code deployment does not prove that setup is complete.

## Where things go

```text
platform/
  apps/             Your apps: one folder per tool, with app.json, server.tsx and README.md
  app/              Shared web routes; maintained by the platform team
  src/              Shared login, permissions, launcher and MCP code
  migrations/       Database changes reviewed by a maintainer
packages/
  ui/               Reusable visual components
  config/           Shared code-formatting and checking rules
skills/             Work guides for consultants’ AI agents; start with Superpowers
scripts/            Scaffolding, repository checks and release tooling
docs/               Current guides, plus clearly marked historical reports
.github/            Automated checks and deployment workflows
```

`platform/app/` (singular) is the framework's routing folder. **Your app belongs in `platform/apps/` (plural).** App metadata and permissions live in each app's `app.json`; imports and the launcher catalog are generated for you.

## Run locally

Install Node.js **22.13+ within 22.x**, or **24.x**, and **pnpm 10.17.1**. From the repository folder:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local address printed in the terminal. This starts the launcher; local development does not bypass sign-in or give you production member data. Automated browser tests use disposable accounts. See [testing](docs/testing.md) and [membership configuration](docs/membership.md) when working on protected screens.

To create an app:

```sh
pnpm app:create alumni "Alumni directory"
```

This creates `platform/apps/alumni/` and registers `/apps/alumni`. It creates a starter, not a finished directory. Follow [the app guide](docs/adding-an-app.md) to add features and grant access.

## Before submitting work

Use a branch and a pull request. The [contribution guide](CONTRIBUTING.md) walks through the process and lists the checks. Required CI must pass; the AI reviewer is advisory and can report an incomplete review. Merging into `main` runs the shared release pipeline for all apps. Maintainers handle production settings and database changes.

This repository is public. Keep member records, client data and credentials out of code, screenshots, issues and AI prompts. Read [data boundaries](docs/data-boundary.md).

Code is licensed under [MIT](LICENSE). See [brand assets](docs/brand-assets.md) for asset provenance.
