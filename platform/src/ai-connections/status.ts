// What the top bar says about the member's AI connections. Pure, so it runs in the browser.
import type { Connection, ConnectionsResponse } from "./contracts";

export type StatusView = {
  kind: "connect" | "active" | "idle" | "ending";
  label: string;
  detail: string | null;
  href: "/connect-ai" | "/account#connected-apps";
};

const MINUTE = 60_000;
const DAY = 86_400_000;
/** No use for this long counts as idle. */
const IDLE_AFTER = 7 * DAY;
/** Warn when the sign-in lapses within this long. */
const WARN_BEFORE = 3 * DAY;

export function relativeTime(iso: string, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - Date.parse(iso));
  if (elapsed < MINUTE) return "just now";
  if (elapsed < 60 * MINUTE) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / (60 * MINUTE))} hr ago`;
  const count = Math.floor(elapsed / DAY);
  return `${count} ${count === 1 ? "day" : "days"} ago`;
}

const lastActivity = (connection: Connection) =>
  Date.parse(connection.lastUsedAt ?? connection.connectedAt);

export function connectionStatus(
  response: ConnectionsResponse | null,
  now: Date,
): StatusView | null {
  if (!response?.enabled) return null;
  if (response.connections.length === 0)
    return { kind: "connect", label: "Connect your AI", detail: null, href: "/connect-ai" };
  // The most recently active app speaks for the rest.
  const latest = [...response.connections].sort((a, b) => lastActivity(b) - lastActivity(a))[0];
  const others = response.connections.length - 1;
  const used = latest.lastUsedAt ? `used ${relativeTime(latest.lastUsedAt, now)}` : "not used yet";
  const detail = `${latest.name} · ${used}${others > 0 ? ` +${others}` : ""}`;
  const href = "/account#connected-apps" as const;
  const remaining = Date.parse(latest.lapsesAt) - now.getTime();
  if (remaining <= WARN_BEFORE) {
    const count = Math.max(1, Math.ceil(remaining / DAY));
    return {
      kind: "ending",
      label: `AI sign-in ends in ${count} ${count === 1 ? "day" : "days"}`,
      detail,
      href,
    };
  }
  if (now.getTime() - lastActivity(latest) >= IDLE_AFTER)
    return { kind: "idle", label: "AI connected · idle", detail, href };
  return { kind: "active", label: "AI connected", detail, href };
}
