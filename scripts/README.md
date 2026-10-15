# Repository tools

Run the documented `pnpm` commands from the repository root; most contributors do not need to edit these scripts.

| Tools                                           | Purpose                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| `platform-apps.mjs`                             | `pnpm app:create`, `pnpm apps:sync`, app registration/security checks |
| `check-architecture.mjs`, `check-workspace.mjs` | Shared import and workspace contracts                                 |
| `check-launcher.mjs`, `smoke-launcher.mjs`      | Local/production release smoke checks                                 |
| `release-*.mjs`                                 | Artifact inspection, provenance and rollback checks                   |
| `check-sarif.mjs`                               | CodeQL severity enforcement                                           |
| `ai-review/`                                    | Advisory model review and synthetic evaluation fixtures               |
| `*.test.mjs`                                    | Tests for the tooling; included in `pnpm test`                        |

See [deployment](../docs/deployment.md), [security review](../docs/security-review.md) and [AI review](../docs/ai-review.md) before changing their tools. Evaluation fixtures are synthetic and can intentionally contain outdated or broken example code; they are not templates for new apps.
