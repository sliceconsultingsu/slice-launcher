import { env } from "cloudflare:workers";
import { errorResponse, json } from "../../../../src/membership/api";
import { MembershipError } from "../../../../src/membership/contracts";
import { identify } from "../../../../src/membership/current";
import { Repository } from "../../../../src/membership/repository";
import { appInfo } from "../../../../src/member-apps/info";
import { memberAppsEnabled } from "../../../../src/member-apps/runtime";

// The guide and versions for a member app's page in the launcher. See src/member-apps/info.ts.
export async function GET(request: Request, { params }: { params: Promise<{ appId: string }> }) {
  try {
    const identity = await identify(request);
    if (!memberAppsEnabled()) throw new MembershipError(404, "App not found.");
    return json(await appInfo(identity, new Repository(env.MEMBERSHIP_DB), (await params).appId));
  } catch (error) {
    return errorResponse(error);
  }
}
