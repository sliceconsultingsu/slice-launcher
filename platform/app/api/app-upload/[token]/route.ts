import { env } from "cloudflare:workers";
import { memberAppsService } from "../../../../src/member-apps/runtime";
import { uploadRequest } from "../../../../src/member-apps/upload-route";

// An app's files, sent to a one-time upload address. See src/member-apps/upload-route.ts.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return uploadRequest(request, (await params).token, {
    db: env.MEMBERSHIP_DB,
    service: memberAppsService(request, env),
  });
}
export const GET = POST;
