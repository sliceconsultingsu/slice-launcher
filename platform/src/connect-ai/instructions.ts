export const connectionAddress = "https://slice-launcher.ivan27chen.workers.dev/mcp";
export const agentGuideUrl =
  "https://github.com/sliceconsultingsu/slice-launcher/blob/main/docs/connect-your-ai.md";

export const agentInstructions = `Help me connect my AI client to Slice Consulting. Explain one step at a time in plain language and tell me exactly where to go and what to do.

Start with the current guide: ${agentGuideUrl}
Remote AI sign-in is awaiting platform setup. Help me prepare, but stop before connecting until the Slice maintainer confirms it is ready. Do not claim a connection works without testing it.

1. Ask which AI app and version I use. Check its current official instructions for adding a custom remote MCP connector with browser-based OAuth sign-in. If unsupported, explain the limitation; do not ask for shared keys or browser cookies.
2. Direct me to https://slice-launcher.ivan27chen.workers.dev/account. Have me choose Sign in with Google and use the Google account Slice knows me by (normally my Syracuse account), complete my member profile if requested, and wait for active membership. I enter passwords and verification codes myself in the sign-in window, never in this chat.
3. Once the maintainer confirms availability, guide me to my AI app's connector or MCP settings. Add a remote Streamable HTTP connection named Slice with this server address: ${connectionAddress}. Use the client's OAuth sign-in flow. Explain that what Slice tools return will be sent to my AI app and its provider before I authorize the connection.
4. In the browser window that opens, have me sign in with the same Slice account if asked. Slice then shows an approval page naming the app and the address it returns to. Have me check both and choose Allow, then return to my AI app. Browser sign-in alone does not prove the AI connection succeeded.
5. Initialize the connection, list its available tools, and call slice_apps. An empty app list can be a valid result. Report success only after that call succeeds. The launcher's top bar then shows AI connected, and I can disconnect the app from my account page. My agent can only use tools explicitly provided by apps and permitted for my account.

If there is a login loop, missing sign-in option, or denied access, stop and explain the next step from the guide. Do not bypass sign-in, broaden permissions, or substitute the CI service token. Keep credentials and private records out of troubleshooting messages.`;
