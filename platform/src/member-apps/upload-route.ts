// POST /api/app-upload/<token>: an app's files, sent to a one-time upload address. The address is
// the credential, so there is no session and no same-address check; it publishes exactly what
// slice_app_publish would, as the member it was made for, after the same checks.
import { errorResponse, json } from "../membership/api";
import { MembershipError } from "../membership/contracts";
import { readUpTo } from "./front-door";
import type { MemberApps } from "./service";
import { takeUpload } from "./uploads";

/** The largest request an upload address reads: 5 MB of files, as JSON, with room for base64. */
export const MAX_UPLOAD_REQUEST_BYTES = 8 * 1024 * 1024;

export type UploadDeps = {
  db: Pick<D1Database, "prepare" | "batch">;
  /** Left out while member apps are switched off. */
  service?: MemberApps;
};

export async function uploadRequest(
  request: Request,
  token: string,
  deps: UploadDeps,
): Promise<Response> {
  try {
    if (!deps.service) throw new MembershipError(404, "Not found.");
    if (request.method !== "POST") return json({ error: "Send the files with POST." }, 405);
    // Read first, and only up to the limit, so an oversized request does not use the address up.
    const body = await readUpTo(request, MAX_UPLOAD_REQUEST_BYTES);
    if (body === null) throw new MembershipError(413, "That is more than 8 MB in one request.");
    const claim = await takeUpload(deps.db, token);
    if (!claim)
      throw new MembershipError(
        404,
        "This upload address has been used or has expired. Ask for a new one with slice_app_upload.",
      );
    let bundle: unknown;
    try {
      bundle = JSON.parse(new TextDecoder().decode(body));
    } catch {
      throw new MembershipError(
        400,
        "Send JSON: the same name, description, guide and files as slice_app_publish. Ask for a new address first.",
      );
    }
    return json(
      await deps.service.publish(claim.identity, claim.appId, bundle, {
        preview: claim.preview,
        large: true,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
