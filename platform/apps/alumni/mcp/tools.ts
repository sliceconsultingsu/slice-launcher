// The assistant tools a student can use. Each does what a screen does, through the same read
// functions and under the same rules: a tool never returns a hidden alum, a merged record, a
// hidden contact detail or another student's answers. The signed-in member's ID always comes
// from the platform, never from the tool's input.
import { z } from "zod";
import type { AppTool } from "../../../src/platform/contracts";
import { defineAppTool } from "../../../src/platform/mcp-tool";
import { searchSchema } from "../data/reads";
import type { AlumniData } from "../data/services";
import { studentAnswersSchema } from "../data/students";
import { myMatches } from "../matching/mine";
import { toolErrors } from "../tool-errors";

export const STUDENT_PERMISSION = "records.read";
/** Tools always read as an ordinary member, even when an admin calls them. */
const asMember = (memberId: string) => ({ memberId, admin: false });
const profileNeeded = {
  status: "profile_needed",
  message:
    "This member has not saved their alumni profile yet. Ask for their major, graduation year, industries of interest and the help they want, then call update_my_profile.",
};

/** `open` is called once per request, so tests can pass a disposable test database. */
export function studentTools(open: () => AlumniData): AppTool[] {
  return [
    defineAppTool({
      name: "search",
      description:
        "Find listed alumni by part of a name or employer, and filter by industry, school, major, city, graduation year or kind of help offered. Returns a page of short results; pass nextOffset as offset for the next page. Filter values are IDs from the lists tool. Example: 'Find alumni who work in consulting in New York.'",
      permission: STUDENT_PERMISSION,
      readOnly: true,
      inputSchema: searchSchema.omit({ includeHidden: true }),
      execute: (input, context) => {
        context.requirePermission(STUDENT_PERMISSION);
        return toolErrors(async () => ({
          ...(await open().reads.searchAlumni(asMember(context.member.id), input)),
        }));
      },
    }),
    defineAppTool({
      name: "get",
      description:
        "Get one alum's profile by ID: education, current and past jobs, the help they offer, their note, the contact details shared with members, and when the profile was last checked. Example: 'Show me this alum's full profile.'",
      permission: STUDENT_PERMISSION,
      readOnly: true,
      inputSchema: z.object({ id: z.string().trim().min(1).max(100) }).strict(),
      execute: ({ id }, context) => {
        context.requirePermission(STUDENT_PERMISSION);
        return toolErrors(async () => {
          const alum = await open().reads.getAlum(asMember(context.member.id), id);
          return alum ? { alum } : { status: "not_found", message: "No listed alum has that ID." };
        });
      },
    }),
    defineAppTool({
      name: "lists",
      description:
        "Get the allowed choices with their IDs: industries, kinds of help, majors, schools, skills and cities. Use these IDs in search filters and in update_my_profile. Example: 'Which industries can I filter by?'",
      permission: STUDENT_PERMISSION,
      readOnly: true,
      inputSchema: z.object({}).strict(),
      execute: (_input, context) => {
        context.requirePermission(STUDENT_PERMISSION);
        return toolErrors(async () => ({ ...(await open().reads.lists()) }));
      },
    }),
    defineAppTool({
      name: "my_profile",
      description:
        "Get the signed-in member's own alumni-app profile: major, graduation year, career goal, skills, industries, cities and the help they want. Example: 'What does my alumni profile say?'",
      permission: STUDENT_PERMISSION,
      readOnly: true,
      inputSchema: z.object({}).strict(),
      execute: (_input, context) => {
        context.requirePermission(STUDENT_PERMISSION);
        return toolErrors(async () => {
          const profile = await open().reads.getStudentProfile(context.member.id);
          return profile ? { profile } : profileNeeded;
        });
      },
    }),
    defineAppTool({
      name: "update_my_profile",
      description:
        "Save the signed-in member's own profile, replacing every answer. Send all answers each time, using IDs from the lists tool; the first major is the primary one. Changes affect future matches only. Example: 'Add technology to my industries of interest.'",
      permission: STUDENT_PERMISSION,
      readOnly: false,
      inputSchema: studentAnswersSchema,
      execute: (input, context) => {
        context.requirePermission(STUDENT_PERMISSION);
        return toolErrors(async () => {
          const data = open();
          await data.students.saveProfile(context.member, input);
          return {
            status: "saved",
            profile: await data.reads.getStudentProfile(context.member.id),
          };
        });
      },
    }),
    defineAppTool({
      name: "my_matches",
      description:
        "Get the signed-in member's alumni matches with the reasons for each, newest first. If a new set is due, it is worked out and recorded first, which is why this tool is marked as changing data. Example: 'Who are my alumni matches this month?'",
      permission: STUDENT_PERMISSION,
      // Honest marking: asking may record the student's next set of matches.
      readOnly: false,
      inputSchema: z.object({}).strict(),
      execute: (_input, context) => {
        context.requirePermission(STUDENT_PERMISSION);
        return toolErrors(async () => ({ ...(await myMatches(open(), context.member.id)) }));
      },
    }),
  ];
}
