# Launcher

## Configuration

Cloudflare Access issuer/audience and D1 binding live in Wrangler config. Runtime credentials are secrets; never expose them to the client. Local test identities and data are disposable. See ../../docs/membership.md.

## Permissions

Cloudflare authenticates human identities. The membership API checks active membership, access levels, and individual overrides on each request. Unknown members remain pending. CI service identities cannot read membership data.

## Deployment

Wrangler deploys the validated build artifact through the protected production workflow. See ../../docs/deployment.md for provenance, verification, rollback and migration ordering. All app modules are included in this one Worker artifact and inherit its login, guarded dispatch, deployment credentials, release checks, and code rollback.

## Testing

Vitest exercises authorization/domain/API and D1 persistence. Playwright exercises actual membership UI against signed synthetic identities and isolated data. Shared CI runs coverage, migrations, and Worker smoke; browser tests do not prove real Google/Cloudflare authentication.

## MCP

The host serves `/mcp`; app modules register typed tools through `src/platform/mcp-tool.ts` and inherit the same verified human identity and current app/action permissions. SDK integration tests cover permission filtering and revocation; a separate workerd test verifies runtime compatibility. See [MCP integration and production OAuth activation](../../docs/mcp.md). Live remote client sign-in is a separate operator check.
