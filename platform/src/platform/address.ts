// Where the launcher lives, and which earlier addresses send people there. Both come from
// configuration (platform/wrangler.jsonc); see docs/launcher-address.md.

export type AddressEnv = {
  /** The one address Slice tells people to use, for example "https://sliceos.app". */
  LAUNCHER_ORIGIN?: string;
  /** Hosts that now redirect to it, separated by commas. Empty means no address redirects. */
  FORMER_HOSTS?: string;
};

const host = (name: string) => name.trim().toLowerCase().replace(/\.$/, "");

/** The launcher's address as configured, or null when it is missing or not a bare HTTPS origin. */
function launcher(value: string | undefined): URL | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === "https:" && url.origin === value ? url : null;
}

/**
 * The address a request to a former host should be sent to, or null to serve it here. A setting
 * that is off or wrong always serves here: the old address keeps working and nothing loops.
 */
export function movedTo(url: URL, env: AddressEnv): string | null {
  const former = String(env.FORMER_HOSTS ?? "")
    .split(",")
    .map(host)
    .filter(Boolean);
  if (!former.includes(host(url.hostname))) return null;
  const target = launcher(env.LAUNCHER_ORIGIN);
  if (!target || former.includes(host(target.hostname))) return null;
  return `${target.origin}${url.pathname}${url.search}`;
}

/** A member app's address: its ID as a name under the launcher's host. */
export function appAddress(launcherOrigin: string, appId: string): string {
  return `https://${appId}.${new URL(launcherOrigin).host}`;
}
