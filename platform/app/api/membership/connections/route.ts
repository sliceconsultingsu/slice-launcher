import { listConnections } from "../../../../src/ai-connections/connections";
import { connectionDeps, identify } from "../../../../src/ai-connections/runtime";
import { errorResponse, json } from "../../../../src/membership/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    return json(await listConnections(await identify(request), connectionDeps(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
