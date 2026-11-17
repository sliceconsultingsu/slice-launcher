import { env } from "cloudflare:workers";
import { disconnectAll } from "../../../src/ai-connections/connections";
import { connectionDeps } from "../../../src/ai-connections/runtime";
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
      // Someone who is suspended or removed also loses the AI apps they connected.
      onAccessLoss: async (subject) => {
        await disconnectAll(subject, connectionDeps(request));
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export const POST = GET;
