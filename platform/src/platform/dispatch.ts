import { MembershipError } from "../membership/contracts";
import type { Identity, State } from "../membership/contracts";
import { readCommand } from "../membership/auth";
import { errorResponse } from "../membership/api";
import { authorizeApp } from "./access";
import type { AppDescriptor, AppModule, AppPageProps } from "./contracts";

export interface PlatformDependencies {
  catalog: readonly AppDescriptor[];
  modules: ReadonlyMap<string, AppModule>;
  verify(request: Request): Promise<Identity>;
  loadState(): Promise<State>;
}

/** Both pages and APIs enter here; app code never receives an unauthenticated request. */
export function createPlatform(dependencies: PlatformDependencies) {
  async function open(request: Request, appId: string) {
    const app = dependencies.catalog.find((item) => item.id === appId);
    const module = dependencies.modules.get(appId);
    if (!app || !module) throw new MembershipError(404, "Application not found.");
    const identity = await dependencies.verify(request);
    // Deliberately reload on every request: suspension/revocation applies to existing sessions.
    const context = authorizeApp(await dependencies.loadState(), identity, app);
    return { module, context };
  }
  return {
    async page(request: Request, appId: string, props: Omit<AppPageProps, "context">) {
      const { module, context } = await open(request, appId);
      return module.Page({ ...props, context });
    },
    async api(request: Request, appId: string, path: string[]) {
      try {
        const { module, context } = await open(request, appId);
        if (!module.api) throw new MembershipError(404, "Application API not found.");
        if (!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(request.method))
          throw new MembershipError(405, "Method not allowed.");
        const input = ["GET", "HEAD"].includes(request.method)
          ? undefined
          : await readCommand(request);
        const response = await module.api({
          context,
          path,
          searchParams: new URL(request.url).searchParams,
          method: request.method,
          input,
        });
        const headers = new Headers(response.headers);
        headers.set("Cache-Control", "private, no-store");
        headers.append("Vary", "Cookie, Cf-Access-Jwt-Assertion");
        headers.delete("CDN-Cache-Control");
        headers.delete("Cloudflare-CDN-Cache-Control");
        headers.delete("Surrogate-Control");
        headers.set("X-Content-Type-Options", "nosniff");
        // Apps share the platform origin, so an app could overwrite or clear the sign-in cookie
        // with a cookie or by asking the browser to clear the site's data.
        headers.delete("Set-Cookie");
        headers.delete("Clear-Site-Data");
        return new Response(request.method === "HEAD" ? null : response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}
