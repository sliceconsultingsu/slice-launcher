# Task 4: Search fictional alumni through the shared MCP adapter

**Owner:** person 4, pending assignment. **Depends on:** starter only; ask Ivan for the small registration change.

## Outcome

An authorized MCP client can search the same sample alumni records used by the directory. MCP is the interface an AI client uses to call an app's tools.

## Scope

Create `platform/apps/alumni/mcp/tools.ts` and `tools.test.ts`. Use the existing `defineAppTool` helper and repository adapter. Export the `search_alumni` tool definition. Coordinate its registration in `server.tsx` with Ivan; do not edit the shared adapter or install an MCP SDK. Follow [the MCP guide](../../mcp.md) and [shared contracts](../../../platform/apps/alumni/README.md#common-interfaces).

## Acceptance examples

- A bounded, trimmed query matches names, companies, roles or industries case-insensitively. A query for Technology returns Jordan Sample.
- Unknown fields and queries above the agreed maximum are rejected by the advertised schema. Empty query behavior is explicit; use an empty string to list the three examples.
- Output identifies the dataset as synthetic; no private contacts or credentials appear.
- Active membership, app access and `records.read` are required. Denied or revoked permissions prevent use; tool discovery does not grant authority.
- The read-only tool changes no records and calls shared data logic.

Run focused module tests and add an integration case through the real shared adapter using synthetic membership. Follow the existing platform MCP tests for the transport. Demonstrate discovery and an allowed/denied call, then run the full contributor checks and open a PR. Local synthetic transport tests do not establish live OAuth/client acceptance.

**Later:** expose the approved matching function. Record editing needs a separately approved write permission and workflow.
