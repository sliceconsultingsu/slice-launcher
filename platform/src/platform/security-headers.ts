// Browser security headers for every response the Worker produces. Static files are served by
// Cloudflare before the Worker runs; their headers live in public/_headers.

/**
 * The policy for Slice's own pages. The page framework writes page data into inline scripts, so
 * inline scripts stay allowed: this policy limits where a page can load from, send data to and be
 * framed by, but it is not a defence against script injected into a page.
 */
export const PAGE_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Adds the headers a response lacks. A route that sets its own, stricter value (the AI approval
 * page does) keeps it.
 */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  const fallback = (name: string, value: string) => {
    if (!headers.has(name)) headers.set(name, value);
  };
  fallback("Strict-Transport-Security", "max-age=31536000");
  fallback("X-Content-Type-Options", "nosniff");
  if (/^text\/html\b/i.test(headers.get("Content-Type") ?? "")) {
    fallback("Content-Security-Policy", PAGE_POLICY);
    fallback("X-Frame-Options", "DENY");
    // Not no-referrer: that makes browsers send "Origin: null" with same-origin form posts.
    fallback("Referrer-Policy", "same-origin");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
