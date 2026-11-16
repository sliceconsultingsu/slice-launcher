// How the screens talk to the app's own API. Screens never import storage or server code: they
// call these guarded routes, which check the signed-in member's permissions on every request.
const API = "/api/apps/alumni/";
export const APP = "/apps/alumni";

export interface ApiResult<Body> {
  ok: boolean;
  status: number;
  /** The response body when the request succeeded. */
  data: Body | null;
  /** A plain message to show when it did not. */
  error: string | null;
}

/**
 * Sends one request. `Body` is the shape the route returns, taken from the server's own types.
 * The response comes from this app's API on the same origin, so its shape is not checked again.
 */
export async function request<Body>(
  path: string,
  options: { method?: "GET" | "POST" | "PUT"; body?: unknown; signal?: AbortSignal } = {},
): Promise<ApiResult<Body>> {
  const fallback = "We couldn’t reach the alumni app. Check your connection and try again.";
  try {
    const response = await fetch(API + path, {
      method: options.method ?? "GET",
      cache: "no-store",
      redirect: "error",
      signal: options.signal,
      ...(options.body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(options.body) }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (response.ok) return { ok: true, status: response.status, data: body as Body, error: null };
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : response.status === 403
          ? "You don’t have access to do this. Ask a Slice admin."
          : fallback;
    return { ok: false, status: response.status, data: null, error: message };
  } catch {
    return { ok: false, status: 0, data: null, error: fallback };
  }
}

export function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** 'YYYY-MM' as "Mar 2024". */
export function formatMonth(value: string | null): string | null {
  return value ? (formatDate(`${value}-15T00:00:00.000Z`)?.replace(/ \d+,/, "") ?? null) : null;
}

/** "Today", "Yesterday", "5 days ago", then the date. */
export function formatAgo(value: string, now = Date.now()): string | null {
  const then = Date.parse(value);
  if (Number.isNaN(then)) return null;
  const days = Math.floor((now - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 56) return `${Math.floor(days / 7)} weeks ago`;
  return formatDate(value);
}
