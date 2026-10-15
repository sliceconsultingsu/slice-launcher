import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";
import { z } from "zod";
import { MembershipError } from "../membership/contracts";
import type { State, Identity } from "../membership/contracts";
import { errorResponse } from "../membership/api";
import { authorizeApp, authorizeMember } from "./access";
import type { AppDescriptor, AppTool } from "./contracts";
import type { PlatformDependencies } from "./dispatch";

const MAX_REQUEST_BYTES = 16384;
const MAX_RESULT_BYTES = 65536;

function privateResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Origin, Authorization, Cookie, Cf-Access-Jwt-Assertion");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: response.status, headers });
}
function toolResult(value: Record<string, unknown>) {
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).byteLength > MAX_RESULT_BYTES)
    throw new Error("Tool result exceeds platform limit");
  return { content: [{ type: "text" as const, text }], structuredContent: value };
}
function canUse(state: State, identity: Identity, app: AppDescriptor, tool?: AppTool) {
  try {
    const context = authorizeApp(state, identity, app);
    if (tool) context.requirePermission(tool.permission);
    return true;
  } catch (error) {
    if (error instanceof MembershipError && error.status === 403) return false;
    throw error;
  }
}
function registeredTools(dependencies: PlatformDependencies) {
  const entries: { app: AppDescriptor; tool: AppTool; name: string }[] = [];
  const names = new Set<string>();
  for (const app of dependencies.catalog) {
    for (const tool of dependencies.modules.get(app.id)?.tools ?? []) {
      const name = `${app.id}__${tool.name}`;
      if (
        !/^[a-z][a-z0-9_]{0,63}$/.test(tool.name) ||
        name.length > 128 ||
        names.has(name) ||
        !tool.description.trim() ||
        tool.description.length > 1000 ||
        typeof tool.readOnly !== "boolean" ||
        !app.permissions.some((p) => p.id === tool.permission)
      )
        throw new Error("Invalid platform tool registration");
      names.add(name);
      entries.push({ app, tool, name });
      if (entries.length > 100) throw new Error("Platform tool limit exceeded");
    }
  }
  return entries;
}

/** One stateless server per request: no shared sessions, credentials or permission snapshots. */
export function createMcpAdapter(dependencies: PlatformDependencies) {
  return async (request: Request): Promise<Response> => {
    let server: McpServer | undefined;
    try {
      // Access verifies client OAuth at the edge; this is the SAME signed identity verifier as UI/API.
      const identity = await dependencies.verify(request);
      const state = await dependencies.loadState();
      authorizeMember(state, identity);
      const origin = request.headers.get("origin");
      if (
        (origin !== null && origin !== new URL(request.url).origin) ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        throw new MembershipError(403, "Cross-origin MCP requests are not allowed.");
      if (request.method !== "POST")
        return privateResponse(new Response(null, { status: 405, headers: { Allow: "POST" } }));
      server = new McpServer(
        { name: "slice-platform", version: "1.0.0" },
        {
          jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
        },
      );
      // Always available to active members, even with an empty application catalog.
      server.registerTool(
        "slice_apps",
        {
          description:
            "List Slice applications you can currently access. App tools require separately granted actions.",
          inputSchema: z.object({}).strict(),
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        },
        async () => {
          try {
            const current = await dependencies.loadState();
            authorizeMember(current, identity);
            return toolResult({
              apps: dependencies.catalog
                .filter((app) => dependencies.modules.has(app.id) && canUse(current, identity, app))
                .map(({ id, name, description }) => ({ id, name, description })),
            });
          } catch {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: "Application discovery is unavailable. Check your membership and try again.",
                },
              ],
            };
          }
        },
      );
      for (const { app, tool, name } of registeredTools(dependencies)) {
        if (!canUse(state, identity, app, tool)) continue;
        server.registerTool(
          name,
          {
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: {
              readOnlyHint: tool.readOnly,
              destructiveHint: !tool.readOnly,
              // App implementations may contact external systems; do not promise isolation.
              openWorldHint: true,
            },
          },
          async (input) => {
            try {
              // Recheck immediately before dispatch, including revocation after discovery.
              const context = authorizeApp(await dependencies.loadState(), identity, app);
              context.requirePermission(tool.permission);
              return toolResult(await tool.execute(input, context));
            } catch (error) {
              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text:
                      error instanceof MembershipError && error.status === 403
                        ? "You no longer have permission to run this tool."
                        : "The tool could not complete. Check the input or contact the app owner.",
                  },
                ],
              };
            }
          },
        );
      }
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        maxRequestBodySize: MAX_REQUEST_BYTES,
      });
      await server.connect(transport);
      return privateResponse(await transport.handleRequest(request));
    } catch (error) {
      return privateResponse(errorResponse(error));
    } finally {
      // JSON-only requests are complete before handleRequest resolves; no SSE lifetime to retain.
      await server?.close();
    }
  };
}
