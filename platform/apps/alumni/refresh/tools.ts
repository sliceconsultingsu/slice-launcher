// The three assistant tools for the alumni refresh. Each checks the refresh.run permission before
// doing anything else. None of them approves or rejects a proposal: a person does that on the
// review page.
import { z } from "zod";
import type { AppTool } from "../../../src/platform/contracts";
import { defineAppTool } from "../../../src/platform/mcp-tool";
import { isAdmin } from "../access";
import type { AlumniData } from "../data/services";
import { toolErrors } from "../tool-errors";
import { RUN_LIMIT_DEFAULT, RUN_LIMIT_MAX } from "./config";
import { refreshDue } from "./due";
import { refreshFile, refreshFileSchema } from "./file";
import { refreshGraduates } from "./graduates";

export const REFRESH_PERMISSION = "refresh.run";

/** `open` is called once per request, so tests can pass a disposable test database. */
export function refreshTools(open: () => AlumniData): AppTool[] {
  return [
    defineAppTool({
      name: "refresh_due",
      description:
        "List the alumni due for a refresh check, oldest check first, with the experience address to read for each and the fixed list of industries. Example: 'Which alumni are due for a check?'",
      permission: REFRESH_PERMISSION,
      readOnly: true,
      inputSchema: z
        .object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(RUN_LIMIT_MAX)
            .optional()
            .describe(`How many alumni to return. Default ${RUN_LIMIT_DEFAULT}.`),
        })
        .strict(),
      execute: (input, context) => {
        context.requirePermission(REFRESH_PERMISSION);
        return toolErrors(() => refreshDue(open(), { admin: isAdmin(context) }, input));
      },
    }),
    defineAppTool({
      name: "refresh_file",
      description:
        "File what was read from one alum's experience page. The app compares it with the stored profile and records the result; a difference becomes a proposal for an admin to review. File one alum at a time. Example: 'File the result for the alum I just read.'",
      permission: REFRESH_PERMISSION,
      readOnly: false,
      inputSchema: refreshFileSchema,
      execute: (input, context) => {
        context.requirePermission(REFRESH_PERMISSION);
        return toolErrors(() => refreshFile(open(), { admin: isAdmin(context) }, input));
      },
    }),
    defineAppTool({
      name: "refresh_graduates",
      description:
        "Turn students whose graduation date has passed into alumni. Safe to call again: nobody is added twice. Example: 'Add this year's graduates to the alumni list.'",
      permission: REFRESH_PERMISSION,
      readOnly: false,
      inputSchema: z.object({}).strict(),
      execute: (_input, context) => {
        context.requirePermission(REFRESH_PERMISSION);
        return toolErrors(() => refreshGraduates(open()));
      },
    }),
  ];
}
