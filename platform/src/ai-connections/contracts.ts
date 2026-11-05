// Shapes shared by the connected-apps API and the browser components. Type-only: safe to import
// from client code.

/** One AI app the member approved. Times are ISO 8601 strings. */
export type Connection = {
  id: string;
  name: string;
  connectedAt: string;
  lastUsedAt: string | null;
  /** When the app's sign-in lapses unless it renews before then. */
  lapsesAt: string;
};

export type ConnectionsResponse = {
  /** False until production AI sign-in is verified; the UI hides itself while false. */
  enabled: boolean;
  connections: Connection[];
};
