import { platform } from "../../src/platform/runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function handle(request: Request) {
  return platform().mcp(request);
}
export {
  handle as POST,
  handle as GET,
  handle as HEAD,
  handle as DELETE,
  handle as OPTIONS,
  handle as PUT,
  handle as PATCH,
};
