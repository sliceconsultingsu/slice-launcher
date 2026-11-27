// What a member app can be called. Its ID is also its address: https://<id>.sliceos.app.

/** How many apps one member can have at a time. Owners are not limited. */
export const APP_LIMIT = 5;
/** How many apps one member can create in a day, however they do it. Every one adds a history entry. */
export const CREATES_PER_DAY = 10;

/** Names kept for Slice itself, or that could pass for part of the launcher or its sign-in. */
const RESERVED = new Set(
  (
    "about account accounts admin administrator api app apps assets auth authorize autoconfig " +
    "billing blog cdn connect dashboard dev docs email files ftp git google guide guides help " +
    "home host id identity imap internal launcher localhost login logout mail mcp member " +
    "members membership oauth official owner pop preview root secure security server settings " +
    "signin signup slice sliceos smtp ssl staff staging static status support sso system team " +
    "test tls user users verify web webmail www"
  ).split(" "),
);

// A letter, then letters, digits or single hyphens, ending in a letter or digit: 3 to 32 in all.
const pattern = /^[a-z](?:[a-z0-9]|-(?=[a-z0-9])){1,30}[a-z0-9]$/;

/** Whether this could be an app's ID at all, whoever asks. Used to read an address. */
export const validAppId = (id: string) => pattern.test(id) && !RESERVED.has(id);

/**
 * Why this ID cannot be used for a new app, as a sentence for the person or their AI, or null
 * when it can. `taken` is every ID in use or ever used, built-in apps included.
 */
export function appIdProblem(id: string, taken: readonly string[]): string | null {
  if (!pattern.test(id))
    return "An app's ID is 3 to 32 lower-case letters, digits and single hyphens. It starts with a letter and ends with a letter or digit.";
  if (RESERVED.has(id)) return "That ID is reserved. Choose another.";
  if (taken.includes(id)) return "That ID is already in use. Choose another.";
  return null;
}
