import { env } from "cloudflare:workers";
import { identify } from "../../../src/membership/current";
import { errorResponse, membershipRequest } from "../../../src/membership/api";
import { Repository } from "../../../src/membership/repository";

export async function GET(request: Request) {
  try {
    const identity = await identify(request);
    return await membershipRequest(request, identity, new Repository(env.MEMBERSHIP_DB));
  } catch (error) {
    return errorResponse(error);
  }
}
export const POST = GET;
