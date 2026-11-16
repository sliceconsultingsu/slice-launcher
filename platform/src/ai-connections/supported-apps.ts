// What Slice can tell a person about an AI app that asks to connect. Any MCP app may register
// (docs/mcp.md), and an app's name is whatever it calls itself, so the address its sign-in returns
// to is the only part of a request Slice can check.

/**
 * Hosted AI apps Slice has checked, by the exact address their sign-in returns to. The whole
 * address must match, not just the site: another page on the same site could pass a sign-in code
 * on to someone else. A trailing "/" marks a folder whose direct children are accepted.
 */
const HOSTED_APPS: [address: string, app: string][] = [
  ["https://claude.ai/api/mcp/auth_callback", "Claude"],
  ["https://claude.com/api/mcp/auth_callback", "Claude"],
  ["https://chatgpt.com/connector_platform_oauth_redirect", "ChatGPT"],
  // ChatGPT's per-connection form: /connector/oauth/{callback_id}
  ["https://chatgpt.com/connector/oauth/", "ChatGPT"],
];
const LOCAL_HOSTS = ["127.0.0.1", "localhost", "[::1]"];

export type ReturnTarget =
  { kind: "hosted"; app: string } | { kind: "local" } | { kind: "unrecognized" };

/**
 * What a return address belongs to: a hosted app Slice has checked, an app on the person's own
 * computer (a loopback address), or an HTTPS address Slice does not recognize. Null when the
 * address may not be used at all: not HTTPS (except loopback), malformed, or carrying credentials.
 */
export function returnTarget(value: unknown): ReturnTarget | null {
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (LOCAL_HOSTS.includes(url.hostname)) return { kind: "local" };
  if (url.protocol !== "https:") return null;
  // Compared as written, so encoded or dotted paths that only resolve to a checked address do
  // not count. A query string or fragment is never part of a checked address.
  const address = `${url.origin}${url.pathname}`;
  const hosted =
    !url.search &&
    !url.hash &&
    value === address &&
    HOSTED_APPS.find(([checked]) =>
      checked.endsWith("/")
        ? address.startsWith(checked) && /^[A-Za-z0-9_-]+$/.test(address.slice(checked.length))
        : address === checked,
    );
  return hosted ? { kind: "hosted", app: hosted[1] } : { kind: "unrecognized" };
}

const NAME_LIMIT = 80;

/**
 * An app's self-declared name, made safe to show: control and invisible formatting characters
 * (including the ones that reverse text direction) are removed, runs of spaces collapsed, and the
 * result cut to a readable length. Empty when nothing printable is left.
 */
export function cleanName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const name = raw
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const characters = [...name];
  return characters.length > NAME_LIMIT ? `${characters.slice(0, NAME_LIMIT - 1).join("")}…` : name;
}
