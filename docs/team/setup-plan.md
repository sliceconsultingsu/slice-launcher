# Alumni team starter setup

## Agreed outcome

Five beginner contributors can work on the alumni database, directory/student profiles, matching, MCP, and refresh runner simultaneously. Each starts with synthetic records, explicit shared contracts, a small acceptance-tested task, an isolated checkout and a reproducible preview. Ivan retains shared architecture and integration ownership. Real data sources, final matching criteria, team identities and remote access are pending.

## Implementation

1. Scaffold `platform/apps/alumni` once. Add bounded alumni/student schemas, synthetic fixtures, a read-only repository interface and a guarded records API. Validate malformed records, rejected writes and missing permissions.
2. Add the directory client used by the real app and the learning preview. Test successful loading, failure/empty states and desktop/mobile accessibility.
3. Add a loopback-only synthetic preview under `platform/tests/team`, reusing the real dispatcher and signed identity verifier with disposable membership storage. Keep its identity keys in memory. Verify foreign hosts/origins are denied and production credentials are unnecessary. No production auth bypass or live data connection.
4. Add workspace creation tooling: five independent clones, branches and ports; refuse existing destinations and invalid slot/ref values. No account provisioning, copied credentials, public tunnels or destructive resets. Verify isolation with temporary repositories.
5. Publish the beginner guide, common interface specification, five task briefs, task issue template and session checklist. Connect existing CI to the new browser checks without weakening current checks. Create five unassigned GitHub starter issues after their source is pushed.
6. Run full repository validation, browser checks, build and smoke test; review the branch; push and open a PR. Provision five prepared SSD checkouts from the verified revision. Named task assignment and individual remote access depend on contributor details.

## Integration decisions

- The starter is explicitly synthetic and read-only; importing real data, computed matching, MCP alumni tools and scheduled refresh are team deliverables, not completed claims.
- App business code stays in the existing module contract. MCP will use the existing shared adapter. A production refresh scheduler needs a reviewed platform extension; no separate app Worker is introduced.
- A proposed development schema is a coordination baseline, not final client acceptance. Shared changes need Ivan's review.
- Separate checkouts prevent accidental edit collisions; they do not isolate operating-system accounts. Remote contributors need individually provisioned access, not Ivan's credentials.
- All app owners test their own changes. Integration is a shared activity coordinated by Ivan.
