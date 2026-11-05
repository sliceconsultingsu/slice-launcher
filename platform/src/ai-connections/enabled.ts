// Whether AI connection status, the connected-apps list and "ready" setup copy are shown.
// Off until production AI sign-in is verified (docs/mcp.md). Only the exact value "true" turns it on.
import { env } from "cloudflare:workers";

export function aiConnectionsEnabled(): boolean {
  // Typed as the configured literal; compare as a string so "true" can switch it on.
  return String(env.AI_CONNECTIONS_ENABLED) === "true";
}
