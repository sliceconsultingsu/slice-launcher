# Connect your AI to Slice

Use this guide when a consultant asks an AI agent to connect to Slice, is stopped at Cloudflare sign-in, or needs help checking a connection. Explain one step at a time in plain language. Ask only for the information needed for the next step.

**Current status: awaiting platform setup.** The shared connection is implemented, but remote sign-in has not been activated and verified. Help the person check their account and prepare their client. Stop before connecting until the Slice maintainer confirms availability. Installing a client or opening the launcher does not prove a working connection.

Use **Connect your AI** in the launcher’s footer to open the setup page and copy a message into your agent. This public repository guide is readable before sign-in; private application data remains behind Cloudflare Access.

## 1. Identify the AI client

Ask which AI app and version the person uses. Check that client’s current official instructions for adding a remote MCP server with Streamable HTTP and OAuth browser sign-in, including support for the OAuth resource indicator. MCP is the connection that lets an AI use tools provided by an application.

Give the exact navigation steps for the verified client/version. Do not invent menu names or assume every Claude or Codex product supports the same setup. If the client cannot make this connection, explain that limitation and ask the maintainer which supported client to use. Use only clients approved for Slice data.

**Done when:** the client is identified and its connection support is confirmed, or the unsupported-client limitation is clearly reported.

## 2. Check the person’s Slice account

Direct the person to [their Slice account](https://slice-launcher.ivan27chen.workers.dev/account). Have them complete the Cloudflare sign-in using their approved Slice account. If asked, they should create their member profile and wait for approval. They must have active membership before using tools.

The person enters their password, verification codes and any consent directly in the sign-in window. Never request these in chat, read or copy browser cookies, or ask for a shared service token. A sign-in identifies the person; membership determines what they can do.

**Done when:** the person confirms their membership is active. For pending, suspended or denied accounts, stop and direct them to the Slice maintainer; the agent cannot approve or restore membership.

## 3. Add the connection when the platform is ready

After the maintainer confirms remote sign-in is available, guide the person to the client’s verified connector/MCP settings and enter:

| Setting        | Value                                               |
| -------------- | --------------------------------------------------- |
| Name           | Slice                                               |
| Server address | `https://slice-launcher.ivan27chen.workers.dev/mcp` |
| Connection     | Remote / Streamable HTTP                            |
| Sign-in        | OAuth through the client’s browser sign-in flow     |

Verified client menus, checked November 5, 2026 against Anthropic and OpenAI help pages:

- **Claude** (web and desktop): Customize → Connectors → Add → Add custom connector. Free plans allow one custom connector; on Team and Enterprise plans an owner adds it for the organization first, then each member connects.
- **ChatGPT**: Plugins → + → Add custom MCP server, with OAuth. Full MCP support is on Business, Enterprise and Edu plans; other plans may be limited to read-only tools.
- **Claude Code**: `claude mcp add --transport http slice https://slice-launcher.ivan27chen.workers.dev/mcp`, then sign in when prompted.

Any MCP-capable app may connect. Slice does not keep a list of approved apps, so help the person choose one they trust with Slice information.

Explain before authorization that tool results go to their AI app and its model provider. Existing Slice permissions do not approve every provider for private data.

The client should open a browser window. If asked, the person signs in with their Slice account. Slice then shows its own approval page naming the app and the address it returns to; have the person check both and choose **Allow**, then return to the AI app. Follow the official flow; a browser session does not automatically sign in a separate agent. Do not supply the CI token or ask for Access policy changes to get past a failure.

**Done when:** the client reports the connection is authorized. This alone is not the final verification.

## 4. Verify with a harmless request

Initialize the MCP connection, list its tools, and call `slice_apps`. Report success only if the call succeeds. An empty app list is a valid result: there are currently no business apps registered. Explain that only explicitly provided tools and actions permitted for this person will be available. The connection does not expose member administration or arbitrary app APIs.

Do not modify business records to test a connection. Use only the minimum data needed. Slice checks current membership and action permissions again on subsequent requests; an agent never receives broader access just because it is an agent.

**Done when:** `slice_apps` succeeds and the person understands what is available, or a concrete failure and next step are reported. Once AI connections are switched on, the launcher's top bar shows **AI connected** and the app appears under **Connected apps** on the account page. Never describe “configuration saved” as “connected.”

## If the person gets stuck

| What happens                                                                   | What the agent should explain and do                                                                                                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login page repeats, HTML is returned, or OAuth discovery fails                 | Stop retrying. Confirm the client/version and ask the maintainer to check Slice's OAuth activation (docs/mcp.md). A normal web login redirect from `/mcp` means activation is not finished. |
| No connection or sign-in option in the AI app                                  | Recheck its official documentation and plan/version support; report the limitation.                                                                                                         |
| Account is pending, suspended, or the approval page says “Membership required” | Direct the person to their account page and the maintainer. Do not try another person’s credentials or grant permissions.                                                                   |
| Sign-in completes but a tool is missing or denied                              | Check that the app offers that tool and the member has the necessary app/action permission. Ask the maintainer for access if appropriate.                                                   |
| The guide or launcher still says setup is pending                              | Prepare only; wait for confirmed activation.                                                                                                                                                |

When asking for help, share only the client name/version, the step, and a short redacted error. Exclude tokens, sign-in URLs containing codes, private records and unredacted logs. To disconnect, choose **Disconnect** under **Connected apps** on the Slice account page; this stops the app at once. Removing the connector in the AI app as well keeps it from asking to reconnect.

Platform maintainers: follow [MCP activation and verification](mcp.md#activate-remote-sign-in). After a verified rollout, update this status and the launcher’s connection page/instructions together with the tested client/version. The guidance page grants no access and changes no configuration.
