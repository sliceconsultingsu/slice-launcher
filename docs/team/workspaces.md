# Separate workspaces for simultaneous development

Each contributor needs their own checkout, branch, preview port and disposable development database. Never let several agents edit the same checkout. The learning preview uses the actual alumni UI and API, the platform dispatcher, signed synthetic identity verification and a temporary local membership database. It does not connect to production storage. Alumni records are currently read-only fixture copies; persistent alumni storage is a later task.

## Maintainer preparation

Run on the approved development host, from a checked-out Slice repository. Put `TEAM_PARENT` on storage approved for code. Replace it with an absolute path on that host; these commands do not provision user accounts.

```sh
corepack pnpm team:workspace create 1 "$TEAM_PARENT" main
corepack pnpm team:workspace create 2 "$TEAM_PARENT" main
corepack pnpm team:workspace create 3 "$TEAM_PARENT" main
corepack pnpm team:workspace create 4 "$TEAM_PARENT" main
corepack pnpm team:workspace create 5 "$TEAM_PARENT" main
```

Before the starter is merged, replace `main` with `feat/alumni-team-starter`. Each clone contains committed source only; credentials, uncommitted files, dependencies and database copies are not carried over. Existing destinations are refused. Failed clones are preserved for inspection, never deleted automatically. To retry, choose a new parent or have the maintainer inspect the failed destination.

| Workspace  | Initial branch             | Preview port |
| ---------- | -------------------------- | ------------ |
| `person-1` | `work/person-1/first-task` | 4311         |
| `person-2` | `work/person-2/first-task` | 4312         |
| `person-3` | `work/person-3/first-task` | 4313         |
| `person-4` | `work/person-4/first-task` | 4314         |
| `person-5` | `work/person-5/first-task` | 4315         |

The ignored `.slice-workspace.json` selects the port. Each clone has its own Git database. These are filesystem-separated workspaces, **not user security isolation**. Before giving a teammate remote access, provision their own OS login or isolated managed environment, limit it to their workspace, and use their own SSH key and GitHub identity. Never share Ivan's login, credential helper, home directory or production credentials. Do not assume Tailscale connectivity grants appropriate SSH access. Workspace creation does not modify SSH, Tailscale, accounts or GitHub permissions.

## Open your preview from your computer

After access is provisioned, your maintainer supplies your SSH host alias, person number and absolute workspace path. For person 1, run this in a terminal **on your own computer**:

```sh
ssh -N -o ExitOnForwardFailure=yes -L 4311:127.0.0.1:4311 YOUR_APPROVED_HOST
```

Keep it open. In a second terminal connect to your own account on that host, change to your workspace, then run:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm team:dev
```

Open `http://127.0.0.1:4311` on your computer. Use your own port from the table. This address works on your computer only while the SSH forward and remote preview are running. The server binds loopback only; do not expose it on a LAN, public tunnel or public hostname. The browser asks for username `learner` and the temporary password in the owner-only file named in **your own** preview terminal. Read that file in your own terminal with `cat` followed by its quoted path. Stopping the preview removes it. Each restart generates a new password; do not share it or put it in a URL, screenshot, issue or commit. All HTTP requests, including source files, require it before the preview uses a fictional owner in the disposable environment. It is not a production sign-in or a multiuser service. A loopback port alone does not isolate local users; retain separate OS accounts and workspace filesystem permissions.

For a standalone approved checkout without workspace settings, `corepack pnpm team:dev` uses port 4310. Override with `corepack pnpm team:dev --port 4312`. Keep the local and remote forwarded port equal. If a port is occupied, stop only your own previous server or agree on a new port; the server will not silently move to a different address.

## Reset and stop

Stop with Ctrl+C. Restarting creates a fresh disposable membership database and reloads the fictional alumni examples. It does not reset source changes or anyone else's data. Source edits survive until you change or revert them through Git. No production reset command is supplied.

## Checks and limits

- Reload the browser after editing the UI. Automatic reload/WebSocket transport is disabled so it cannot bypass the preview password. The preview loads the current app server module for API requests. Restart after changing app registration or contracts that affect startup.
- The preview exercises real UI/API behavior; it is not a full Cloudflare deployment or a real Google/OAuth sign-in test. MCP client acceptance, scheduling and production data migrations require separate validation.
- Run `corepack pnpm --filter @slice/launcher exec playwright install chromium` once before browser tests, then `corepack pnpm test:team`.
- Prepared workspaces use separate test ports too: platform tests use preview port + 100 (4411–4415), and alumni tests use preview port + 200 (4511–4515). A standalone checkout uses 4173 and 4399. Run only one copy of each suite per workspace; teammates can run their suites simultaneously.
- GitHub write access is required to push PR branches; a repository invitation must be accepted first. Verify the author identity before committing. Do not borrow another person's account to bypass access setup.

Browser tests generate their own random per-run password using `SLICE_TEAM_TEST_PASSWORD`; do not set this variable for normal contributor sessions or reuse the test value.
