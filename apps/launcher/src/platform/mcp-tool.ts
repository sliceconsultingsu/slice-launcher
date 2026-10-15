import type { z } from "zod";
import type { AppContext, AppTool } from "./contracts";

/** Infer handler inputs from the same schema advertised to and enforced by the host's SDK. */
export function defineAppTool<Schema extends z.ZodObject>(definition: {
  name: string;
  description: string;
  permission: string;
  readOnly: boolean;
  inputSchema: Schema;
  execute(
    input: z.output<Schema>,
    context: AppContext,
  ): Promise<Record<string, unknown>> | Record<string, unknown>;
}): AppTool {
  return {
    ...definition,
    // The SDK parses inputSchema before dispatch. Restore that checked schema/output relation
    // after AppTool erases the generic for the registry; parsing again would apply transforms twice.
    execute: async (input, context) => definition.execute(input as z.output<Schema>, context),
  };
}
