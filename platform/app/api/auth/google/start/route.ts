import { googleStart } from "../../../../../src/membership/google";
import { googleEnv } from "../../../../../src/membership/current";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return googleStart(request, googleEnv());
}
