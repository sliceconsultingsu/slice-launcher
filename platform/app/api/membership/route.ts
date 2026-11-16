import { env } from "cloudflare:workers";
import { identify } from "../../../src/membership/current";
import { errorResponse, membershipRequest } from "../../../src/membership/api";
import { Repository } from "../../../src/membership/repository";

export async function GET(request: Request) {
  try {
    const identity = await identify(request);
    return await membershipRequest(request, identity, new Repository(env.MEMBERSHIP_DB), {
      // Per person, not per address: people on one network do not use up each other's allowance.
      allowWrite: async (subject) =>
        (await env.WRITE_LIMITER.limit({ key: `membership:${subject}` })).success,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export const POST = GET;
