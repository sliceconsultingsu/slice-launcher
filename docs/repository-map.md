# Repository map

A **repository** is the project's shared folder and change history. A **pull request (PR)** proposes a change for review. **CI** is the automated checking that runs on a PR. **Deployment** puts a validated version online.

## Choose your starting point

| Location                                                | Purpose                                         | Usually edited by                    |
| ------------------------------------------------------- | ----------------------------------------------- | ------------------------------------ |
| [platform/apps/](../platform/apps/README.md)            | Business tools; one folder per app              | App contributors                     |
| [platform/app/](../platform/app/)                       | Shared page/API routes                          | Platform maintainers                 |
| [platform/src/membership/](../platform/src/membership/) | Accounts, approval, roles and permission checks | Platform maintainers                 |
| [platform/src/platform/](../platform/src/platform/)     | Shared app contract, dispatch and MCP           | Platform maintainers                 |
| [packages/ui/](../packages/ui/)                         | Reusable UI                                     | Contributors changing shared visuals |
| [packages/config/](../packages/config/README.md)        | Shared formatting, lint and TypeScript defaults | Platform maintainers                 |
| [scripts/](../scripts/README.md)                        | App scaffolding, CI checks and release tools    | Platform maintainers                 |
| [docs/](README.md)                                      | Current guides and historical evidence          | Everyone                             |
| [.github/workflows/](../.github/workflows/)             | Automated validation, reviews and releases      | Platform maintainers                 |

The platform is one deployable application. Business apps are modules within it, not separate servers or deployments. The package name `@slice/launcher` is retained so existing pnpm commands still work; its files now live under `platform/`.

## Where configuration belongs

| Kind of setting                                             | Source of truth                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| App name, description and action permissions                | `platform/apps/<id>/app.json`                                                                              |
| App implementation and tests                                | The same app folder                                                                                        |
| Catalog and server imports                                  | Generated `platform/src/platform/catalog.generated.json` and `registry.generated.ts`; run `pnpm apps:sync` |
| Shared lint, formatting and TypeScript defaults             | `packages/config/`                                                                                         |
| Platform framework, browser tests, unit tests and CSS setup | Named config files directly in `platform/`                                                                 |
| Worker settings and D1 binding                              | `platform/wrangler.jsonc`; production changes require maintainer review                                    |
| Workspace membership and dependency overrides               | `pnpm-workspace.yaml`                                                                                      |
| Common commands and tool versions                           | Root `package.json`; platform dependencies in `platform/package.json`                                      |
| Installed dependency versions                               | Generated `pnpm-lock.yaml`; commit deliberate dependency updates                                           |
| Credentials and private data                                | Approved private storage, never repository files                                                           |

The root ESLint and Prettier files are small entry points importing `packages/config`. Their conventional filenames let tools find them automatically; app-specific settings do not belong there. Changes to shared rules affect everyone.

## Folders you do not edit by hand

`node_modules/` holds installed libraries. `dist/` is a generated build. `coverage/`, `test-results/` and `playwright-report/` are generated test output. Git ignores those folders. The small generated catalog and import registry **are committed**, so CI can detect stale app registration.

## Looking for older work?

Use the [documentation index](README.md). Plans and experiment reports keep their original paths/results as historical evidence. Current guides describe today's structure. Before this layout, the platform lived at `apps/launcher/`, and app modules lived at `apps/launcher/src/apps/`.

## Updating an existing local checkout

After pulling the folder move, run `pnpm install --frozen-lockfile` from the root. Git moves tracked source, but old ignored caches can remain under `apps/launcher/`; the checks tolerate those leftovers. Keep new source under `platform/`.

If you had private `.dev.vars` or `.env` settings in the old folder, transfer the needed settings privately to the corresponding file in `platform/`, checking for an existing destination first. They are not automatically copied or deleted. Preserve uncommitted source changes and private settings before removing old caches; do not delete the old folder wholesale.
