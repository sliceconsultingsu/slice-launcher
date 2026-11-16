// What Slice can tell a person about an AI app that asks to connect. Any MCP app may register
// (docs/mcp.md), and an app's name is whatever it calls itself, so the address its sign-in returns
// to is the only part of a request Slice can check.

/** Hosted AI apps Slice has checked, by the origin their sign-in returns to. */
const HOSTED_APPS: Record<string, string> = {
  "https://claude.ai": "Claude",
  "https://claude.com": "Claude",
  "https://chatgpt.com": "ChatGPT",
};
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
  const app = HOSTED_APPS[url.origin];
  return app ? { kind: "hosted", app } : { kind: "unrecognized" };
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
