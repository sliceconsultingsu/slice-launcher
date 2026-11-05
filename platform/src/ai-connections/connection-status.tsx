"use client";
import { useEffect, useState } from "react";
import type { ConnectionsResponse } from "./contracts";
import { connectionStatus, type StatusView } from "./status";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

function isConnectionsResponse(value: unknown): value is ConnectionsResponse {
  const data = value as ConnectionsResponse | null;
  return typeof data?.enabled === "boolean" && Array.isArray(data.connections);
}

/**
 * The status for the top bar, or null whenever it cannot be shown: disabled, signed out,
 * not an active member, a failed or slow request, or an unexpected body. The header must
 * never wait on or break because of this.
 */
export async function loadConnectionStatus(
  fetcher: Fetch,
  now: () => Date,
  timeoutMs = 10_000,
): Promise<StatusView | null> {
  try {
    const response = await fetcher("/api/membership/connections", {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return isConnectionsResponse(data) ? connectionStatus(data, now()) : null;
  } catch {
    return null;
  }
}

export function ConnectionStatusView({ view }: { view: StatusView | null }) {
  if (!view) return null;
  return (
    <a
      className="connection-status"
      data-kind={view.kind}
      href={view.href}
      aria-label={view.detail ? `${view.label}: ${view.detail}` : view.label}
    >
      <span className="connection-dot" aria-hidden="true" />
      <span className="connection-label">{view.label}</span>
      {view.detail && <span className="connection-detail">{view.detail}</span>}
    </a>
  );
}

export function ConnectionStatus() {
  const [view, setView] = useState<StatusView | null>(null);
  useEffect(() => {
    let active = true;
    void loadConnectionStatus(
      (input, init) => fetch(input, init),
      () => new Date(),
    ).then((next) => {
      if (active) setView(next);
    });
    return () => {
      active = false;
    };
  }, []);
  return <ConnectionStatusView view={view} />;
}
