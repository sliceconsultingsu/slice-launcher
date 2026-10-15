import { platform } from "../../../../../src/platform/runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ appId: string; path?: string[] }> };
async function handle(request: Request, context: RouteContext) {
  const { appId, path = [] } = await context.params;
  return platform().api(request, appId, path);
}
export {
  handle as GET,
  handle as HEAD,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
};
