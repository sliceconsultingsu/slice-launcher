"use client";
import { useCallback, useEffect, useState } from "react";
import type { ConnectionsResponse } from "./contracts";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

function isConnectionsResponse(value: unknown): value is ConnectionsResponse {
  const data = value as ConnectionsResponse | null;
  return typeof data?.enabled === "boolean" && Array.isArray(data.connections);
}

/** The member's connected apps, or null when the list cannot be shown. */
export async function loadConnections(fetcher: Fetch): Promise<ConnectionsResponse | null> {
  try {
    const response = await fetcher("/api/membership/connections", {
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return isConnectionsResponse(data) ? data : null;
  } catch {
    return null;
  }
}

/** Asks first; returns false when the person cancels. Throws with the server's reason on refusal. */
export async function disconnectConnection(
  id: string,
  name: string,
  io: { confirm: (text: string) => boolean; fetch: Fetch },
): Promise<boolean> {
  if (!io.confirm(`Disconnect ${name}? It stops working at once.`)) return false;
  const response = await io.fetch(`/api/membership/connections/${encodeURIComponent(id)}`, {
    method: "DELETE",
    redirect: "error",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "The app could not be disconnected. Please try again.");
  }
  return true;
}

function day(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone }).format(new Date(iso));
}

export function ConnectedAppsView(props: {
  response: ConnectionsResponse | null;
  busy: boolean;
  error: string | null;
  onDisconnect: (id: string, name: string) => void;
  /** Fixed in tests; the browser's own zone otherwise. */
  timeZone?: string;
}) {
  const { response, busy, error, onDisconnect, timeZone } = props;
  if (!response?.enabled) return null;
  return (
    <section
      id="connected-apps"
      className="account-card connected-apps"
      aria-labelledby="connected-apps-title"
    >
      <h2 id="connected-apps-title">Connected apps</h2>
      <p>
        Apps you allowed through sign-in. They act as you, with your current access. Disconnecting
        one stops it at once.
      </p>
      {error && (
        <p className="notice error-notice" role="alert">
          {error}
        </p>
      )}
      {response.connections.length === 0 ? (
        <p className="connected-apps-empty">
          No connected apps. <a href="/connect-ai">Connect your AI</a>
        </p>
      ) : (
        <div className="connected-apps-table">
          <table>
            <thead>
              <tr>
                <th scope="col">App</th>
                <th scope="col">Connected</th>
                <th scope="col">Last used</th>
                <th scope="col">Sign-in lapses</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {response.connections.map((connection) => (
                <tr key={connection.id}>
                  <th scope="row">{connection.name}</th>
                  <td>{day(connection.connectedAt, timeZone)}</td>
                  <td>{connection.lastUsedAt ? day(connection.lastUsedAt, timeZone) : "Never"}</td>
                  <td>{day(connection.lapsesAt, timeZone)}</td>
                  <td>
                    <button
                      type="button"
                      className="text-button danger-text"
                      disabled={busy}
                      aria-label={`Disconnect ${connection.name}`}
                      onClick={() => onDisconnect(connection.id, connection.name)}
                    >
                      Disconnect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ConnectedApps() {
  const [response, setResponse] = useState<ConnectionsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setResponse(await loadConnections((input, init) => fetch(input, init)));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const onDisconnect = (id: string, name: string) => {
    setBusy(true);
    setError(null);
    void disconnectConnection(id, name, {
      confirm: (text) => window.confirm(text),
      fetch: (input, init) => fetch(input, init),
    })
      .then((done) => (done ? load() : undefined))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "The app could not be disconnected."),
      )
      .finally(() => setBusy(false));
  };
  return (
    <ConnectedAppsView response={response} busy={busy} error={error} onDisconnect={onDisconnect} />
  );
}
