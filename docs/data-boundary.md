# Public code and private data

This repository is public. Application code, schemas, migrations, and synthetic test fixtures can be reviewed here. The alumni database and other confidential records belong in separately controlled storage and never in Git history, issues, pull requests, build logs, or client bundles.

- Store production secrets in Cloudflare and GitHub environment secrets, not source files. Local `.env` and `.dev.vars` files are ignored by Git; use example files with placeholder values only.
- Browser code may contain only data intended to be public. Keep database credentials and confidential queries in server-side code with an authorization check.
- Use synthetic or explicitly approved non-confidential test data. Never copy a production database to create a fixture.
- Review new dependencies, logs, and error handling for accidental exposure before merging.
- If a secret is committed, rotate it and remove it from Git history before continuing; deleting it from the latest commit is insufficient.

The platform uses private D1 storage for membership. All application modules inherit verified identity and current membership checks through platform routes. Keep app records in server-side controlled storage; the public catalog contains names, descriptions and declared permission labels only. All modules are trusted code in one Worker, not a sandbox for untrusted contributors.

MCP tool results go to the consultant's selected client and potentially its model provider. Existing app permissions determine what the member may access; they do not by themselves approve sending all accessible data to every provider. Use approved clients, return only necessary fields, enforce record-level rules and avoid including credentials or unrelated member data. The platform does not persist client transcripts or automatically audit app operations. See [the MCP contract](mcp.md).
