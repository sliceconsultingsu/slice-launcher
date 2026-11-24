// Where the launcher lives, and which earlier addresses send people there. Both come from
// configuration (platform/wrangler.jsonc); see docs/launcher-address.md.
import { validAppId } from "../member-apps/rules";

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

/**
 * Whether a request is for a member app's address. Returns the app's ID for a name directly under
 * the launcher's host; "" for any other name under it, which is nobody's address and must never
 * reach the launcher's own pages or sign-in; and null for everything else, the launcher included.
 */
export function appHost(url: URL, env: AddressEnv): string | null {
  const home = launcher(env.LAUNCHER_ORIGIN);
  if (!home) return null;
  const suffix = `.${host(home.hostname)}`;
  const name = host(url.hostname);
  if (!name.endsWith(suffix)) return null;
  const label = name.slice(0, -suffix.length);
  return validAppId(label) ? label : "";
}

/** A member app's address: its ID as a name under the launcher's host. */
export function appAddress(launcherOrigin: string, appId: string): string {
  return `https://${appId}.${new URL(launcherOrigin).host}`;
}
