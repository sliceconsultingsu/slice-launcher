# Start building the alumni app

The goal is an alumni database that helps students find relevant alumni, with MCP access and a bot that refreshes approved data. Five people can contribute independently, then combine small reviewed changes.

**Available now:** a working read-only directory with fictional alumni and student records, shared data contracts, isolated preview tooling, and five starter tasks. **Still to build:** persistent alumni storage/import, profile editing, actual matching, alumni MCP tools, and the refresh runner. The sample app is not a real alumni database.

## Your first session

1. Sign in to your own GitHub account. Accept the repository invitation from the maintainer. If you have no invitation, give the maintainer your GitHub username; do not share a password or personal token. Reading this public repository does not grant permission to push a branch.
2. Get a person number (1–5), a task and an approved development workspace from Ivan. [Workspace setup](workspaces.md) explains the maintainer preparation and remote connection. GitHub access and development-host access are separate.
3. Open **your own** workspace. Run `corepack pnpm install --frozen-lockfile` once. Run `corepack pnpm team:dev` to start the fictional-data preview. Leave that terminal running. Open the address through your SSH port forward as described in the workspace guide, then enter `learner` and the temporary password from the owner-only file named in your terminal.
4. Confirm you can see Alex Example and Casey Example, and the “Learning preview” notice. If you see a real sign-in screen, you started `dev` instead of `team:dev`. Stop and check the command; do not request production credentials.
5. Start with a tiny practice change: improve one sentence in your task's README. Ask your coding agent to explain the change, show the diff, and open a draft PR. Ivan reviews this first contribution before you start a larger feature.

Prerequisites: Git, Node **22.13+ within 22.x or 24.x**, and Corepack using the repository's **pnpm 10.17.1**. `corepack pnpm --version` should print `10.17.1`. Use the repository's versions, not a global package-manager upgrade. Dependencies are installed in each workspace, never committed.

## Choose one starter task

| Person slot | Area                   | First task                                                          | Primary working files            |
| ----------- | ---------------------- | ------------------------------------------------------------------- | -------------------------------- |
| 1           | Data foundation        | [Validate an import and report duplicates](tasks/01-data-import.md) | `platform/apps/alumni/data/`     |
| 2           | Directory and profiles | [Filter the alumni list by industry](tasks/02-directory.md)         | `platform/apps/alumni/ui/`       |
| 3           | Matching               | [Explain one example match](tasks/03-matching.md)                   | `platform/apps/alumni/matching/` |
| 4           | MCP integration        | [Expose sample alumni search](tasks/04-mcp.md)                      | `platform/apps/alumni/mcp/`      |
| 5           | Refresh runner         | [Propose a record update safely](tasks/05-refresh.md)               | `platform/apps/alumni/refresh/`  |

These are unassigned role slots, not a claim about anyone's experience. Put one actual owner on each GitHub issue when their account and availability are confirmed. The first tasks work from the existing fixtures; nobody needs to wait for another person's unfinished database or network service.

Ivan owns the common schema, app entry point, permission declarations, migrations, platform code, dependency changes and release decisions. A task that needs one of those files requests a small integration change; do not have five people edit them independently. Folder ownership is coordination, not a security boundary.

## The routine for every task

**Pick one issue → branch → plan → build → demonstrate → PR → review → merge.**

- Start from current `main` once the starter PR is merged. Before that, use the starter PR's branch as the task base and mark your PR as dependent; do not merge a dependent task ahead of the starter.
- Use a short-lived branch for each task. A branch is your proposed set of changes. Keep one task in progress per person and open a draft PR early. Update with merged work between tasks; ask for help with conflicts instead of replacing someone else's changes.
- Read the task brief and [shared contracts](../../platform/apps/alumni/README.md#common-interfaces). Explain the expected result before generating code. Your agent should read root `AGENTS.md` and the app's README.
- Keep the change within the task. Use only fictional data in code, prompts, screenshots, issues and PRs. Do not add a new database, login system, deployment, dependency or scraping source as a shortcut.
- Run the task's focused checks as you work. Before review, run the full [contributor checks](../../CONTRIBUTING.md#4-implement-and-check), including `corepack pnpm test:team`.
- Demonstrate the result and one failure case. Explain what changed, why it works, and what is unfinished. A green test or an agent's claim alone is not a demo.
- Push and open a PR. Passing automated checks and Ivan's review are required for consultant contributions. Do not directly deploy, merge your own work or bypass failing checks. “Pushed”, “merged” and “live” mean different things.

## A task prompt to copy

> Read AGENTS.md, platform/apps/alumni/README.md, docs/team/workspaces.md, and my task brief. Explain the user-visible result and the files you will change. Work on my task branch in my workspace. Add a test for the requested behavior, implement the smallest change, and run the relevant checks. Keep shared contracts, permissions and platform files unchanged unless the task explicitly includes an agreed integration change. Use fictional data only. Show me how to demonstrate the result and explain anything still unfinished. Prepare a PR for Ivan's review; do not merge or deploy.

## Team check-in

At each working session, every person reports: their issue, what they can now demonstrate, the next small step, and any dependency needing a decision. Review and integrate small PRs frequently rather than combining five large branches at the end. Ivan coordinates integration; each contributor fixes and tests their own component.

## Done means

The issue's examples work; its failure case is covered; current checks pass; the contributor can explain and demonstrate the behavior; the PR contains no private records or secrets; and review is complete. Business acceptance of fields, matching rules, allowed refresh sources and data access still needs the client.

## See the starter

[Desktop screenshot](images/desktop.png) · [Mobile screenshot](images/mobile.png). Both PNG files show fictional data and open in a browser or image viewer. Desktop uses a 1440px viewport; mobile uses 390px. Reproduce them with `corepack pnpm team:dev`. Editable source and the runnable preview are included in this repository.

## Setup implementation record

### Agreed outcome

Five beginner contributors can work on the alumni database, directory/student profiles, matching, MCP, and refresh runner simultaneously. Each starts with synthetic records, explicit shared contracts, a small acceptance-tested task, an isolated checkout and a reproducible preview. Ivan retains shared architecture and integration ownership. Real data sources, final matching criteria, team identities and remote access are pending.

### Implementation

1. Scaffold `platform/apps/alumni` once. Add bounded alumni/student schemas, synthetic fixtures, a read-only repository interface and a guarded records API. Validate malformed records, rejected writes and missing permissions.
2. Add the directory client used by the real app and the learning preview. Test successful loading, failure/empty states and desktop/mobile accessibility.
3. Add a loopback-only synthetic preview under `platform/tests/team`, reusing the real dispatcher and signed identity verifier with disposable membership storage. Keep its identity keys in memory. Verify foreign hosts/origins are denied and production credentials are unnecessary. No production auth bypass or live data connection.
4. Add workspace creation tooling: five independent clones, branches and ports; refuse existing destinations and invalid slot/ref values. No account provisioning, copied credentials, public tunnels or destructive resets. Verify isolation with temporary repositories.
5. Publish the beginner guide, common interface specification, five task briefs, task issue template and session checklist. Connect existing CI to the new browser checks without weakening current checks. Create five unassigned GitHub starter issues after their source is pushed.
6. Run full repository validation, browser checks, build and smoke test; review the branch; push and open a PR. Provision five prepared SSD checkouts from the verified revision. Named task assignment and individual remote access depend on contributor details.

### Integration decisions

- The starter is explicitly synthetic and read-only; importing real data, computed matching, MCP alumni tools and scheduled refresh are team deliverables, not completed claims.
- App business code stays in the existing module contract. MCP will use the existing shared adapter. A production refresh scheduler needs a reviewed platform extension; no separate app Worker is introduced.
- A proposed development schema is a coordination baseline, not final client acceptance. Shared changes need Ivan's review.
- Separate checkouts prevent accidental edit collisions; they do not isolate operating-system accounts. Remote contributors need individually provisioned access, not Ivan's credentials.
- All app owners test their own changes. Integration is a shared activity coordinated by Ivan.
