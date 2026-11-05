import { describe, expect, it } from "vitest";
import { connectionStatus, relativeTime } from "./status";
import type { Connection, ConnectionsResponse } from "./contracts";

const now = new Date("2026-11-05T12:00:00Z");
const minutes = (n: number) => new Date(now.getTime() - n * 60_000).toISOString();
const days = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

function connection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: "grant-1",
    name: "Claude",
    connectedAt: minutes(60 * 24 * 3),
    lastUsedAt: minutes(5),
    lapsesAt: days(20),
    ...overrides,
  };
}
const response = (...connections: Connection[]): ConnectionsResponse => ({
  enabled: true,
  connections,
});

describe("connectionStatus", () => {
  it("null or disabled response hides status", () => {
    expect(connectionStatus(null, now)).toBeNull();
    expect(connectionStatus({ enabled: false, connections: [connection()] }, now)).toBeNull();
  });

  it("no connections shows Connect your AI", () => {
    expect(connectionStatus(response(), now)).toEqual({
      kind: "connect",
      label: "Connect your AI",
      detail: null,
      href: "/connect-ai",
    });
  });

  it("used within 7 days is active", () => {
    expect(connectionStatus(response(connection()), now)).toEqual({
      kind: "active",
      label: "AI connected",
      detail: "Claude · used 5 min ago",
      href: "/account#connected-apps",
    });
  });

  it("unused 7+ days is idle", () => {
    const status = connectionStatus(
      response(connection({ lastUsedAt: minutes(60 * 24 * 8) })),
      now,
    );
    expect(status?.kind).toBe("idle");
    expect(status?.label).toBe("AI connected · idle");
  });

  it("never used and connected 7+ days ago is idle", () => {
    const status = connectionStatus(
      response(connection({ lastUsedAt: null, connectedAt: minutes(60 * 24 * 9) })),
      now,
    );
    expect(status?.kind).toBe("idle");
    expect(status?.detail).toBe("Claude · not used yet");
  });

  it("lapsing within 3 days warns", () => {
    expect(connectionStatus(response(connection({ lapsesAt: days(1.5) })), now)?.label).toBe(
      "AI sign-in ends in 2 days",
    );
    expect(connectionStatus(response(connection({ lapsesAt: days(0.5) })), now)).toMatchObject({
      kind: "ending",
      label: "AI sign-in ends in 1 day",
      href: "/account#connected-apps",
    });
  });

  it("several apps show the most recent plus count", () => {
    const status = connectionStatus(
      response(
        connection({ id: "a", name: "ChatGPT", lastUsedAt: minutes(90) }),
        connection({ id: "b", name: "Claude", lastUsedAt: minutes(5) }),
      ),
      now,
    );
    expect(status?.detail).toBe("Claude · used 5 min ago +1");
  });
});

describe("relativeTime", () => {
  it("describes recent times in words people use", () => {
    expect(relativeTime(minutes(0.5), now)).toBe("just now");
    expect(relativeTime(minutes(5), now)).toBe("5 min ago");
    expect(relativeTime(minutes(150), now)).toBe("2 hr ago");
    expect(relativeTime(minutes(60 * 24 * 3), now)).toBe("3 days ago");
    expect(relativeTime(minutes(60 * 24), now)).toBe("1 day ago");
  });
});
