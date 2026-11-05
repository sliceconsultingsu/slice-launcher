// Slice's Worker entry. vinext still serves every page and API; this file exists so the
// platform can put request handling in front of it (AI sign-in) without forking vinext.
import vinext from "vinext/server/fetch-handler";

export default {
  fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext) {
    return vinext.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<CloudflareEnv>;
