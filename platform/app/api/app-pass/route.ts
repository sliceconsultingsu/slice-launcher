import { errorResponse } from "../../../src/membership/api";
import { passRequest } from "../../../src/member-apps/pass-route";
import { passDeps } from "../../../src/member-apps/runtime";

// Carries a signed-in person who may open a member app to that app's address, with a one-time
// pass. See src/member-apps/pass-route.ts.
export async function GET(request: Request) {
  try {
    return await passRequest(request, passDeps(request));
  } catch (error) {
    return errorResponse(error);
  }
}
export const POST = GET;
