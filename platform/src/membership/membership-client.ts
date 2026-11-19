// Browser-side reads and saves of the signed-in person's membership view. The server checks
// every request; nothing here decides what anyone may do.
import type { Command, View } from "./contracts";

/** What the membership API answers for a signed-in person with no profile yet. */
export type NeedsProfile = { needsEnrollment: true };

/** Thrown with the server's own message, and whether nobody is signed in. */
export class MembershipRequestError extends Error {
  constructor(
    message: string,
    public signedOut: boolean,
  ) {
    super(message);
  }
}

async function read(response: Response, fallback: string): Promise<View | NeedsProfile> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok)
    throw new MembershipRequestError(body.error ?? fallback, response.status === 401);
  return body as View | NeedsProfile;
}

export async function loadView(): Promise<View | NeedsProfile> {
  const response = await fetch("/api/membership", { cache: "no-store", redirect: "error" });
  return read(response, "Unable to load membership.");
}

/** Saves one change. A stale `revision` is refused, so a newer change is never overwritten. */
export async function saveCommand(revision: number, command: Command): Promise<View> {
  const response = await fetch("/api/membership", {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ revision, command }),
  });
  return (await read(response, "Unable to save changes.")) as View;
}
