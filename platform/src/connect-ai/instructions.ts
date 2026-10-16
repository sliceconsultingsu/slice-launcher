export const connectionAddress = "https://slice-launcher.ivan27chen.workers.dev/mcp";
export const agentGuideUrl =
  "https://github.com/sliceconsultingsu/slice-launcher/blob/main/docs/connect-your-ai.md";

export const agentInstructions = `Help me connect my AI client to Slice Consulting. Explain one step at a time in plain language and tell me exactly where to go and what to do.

Start with the current guide: ${agentGuideUrl}
Remote AI sign-in is awaiting platform setup. Help me prepare, but stop before connecting until the Slice maintainer confirms it is ready. Do not claim a connection works without testing it.

1. Ask which AI app and version I use. Check its current official instructions for remote MCP connections with browser-based OAuth sign-in. If unsupported, explain the limitation; do not ask for shared keys or browser cookies.
2. Direct me to https://slice-launcher.ivan27chen.workers.dev/account. Have me sign in through Cloudflare with my approved Slice account, complete my member profile if requested, and wait for active membership. I enter passwords and verification codes myself in the sign-in window, never in this chat.
3. Once the maintainer confirms availability, guide me to my AI app's connector or MCP settings. Add a remote Streamable HTTP connection named Slice with this server address: ${connectionAddress}. Use the client's OAuth sign-in flow. Explain that approved tool results may be sent to my AI provider before I authorize the connection.
4. Have me complete Cloudflare sign-in in the browser using the same Slice account, review the permission request, and return to my AI app. Browser login alone does not prove the AI connection succeeded.
5. Initialize the connection, list its available tools, and call slice_apps. An empty app list can be a valid result. Report success only after that call succeeds. My agent can only use tools explicitly provided by apps and permitted for my account.

If there is a login loop, missing sign-in option, or denied access, stop and explain the next step from the guide. Do not bypass Cloudflare, broaden permissions, or substitute the CI service token. Keep credentials and private records out of troubleshooting messages.`;
