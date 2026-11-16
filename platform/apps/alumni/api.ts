// The app's API routes, under /api/apps/alumni/. The platform has already verified the member
// and their access to the app. Each route checks its own permission before doing anything else,
// then validates its input. Reads never change data; writes arrive as same-origin JSON.
import { z } from "zod";
import { MembershipError } from "../../src/membership/contracts";
import type { AppApiProps } from "../../src/platform/contracts";
import { createSampleRepository, readDirectory } from "./data";
import { isAdmin, viewerOf } from "./access";
import { importAlumni, importSchema } from "./data/import";
import { InvalidChoiceError, searchSchema } from "./data/reads";
import type { AlumniData } from "./data/services";
import { AlumniDataError } from "./data/store";
import { studentAnswersSchema } from "./data/students";
import { myMatches } from "./matching/mine";
import { pendingProposals } from "./refresh/review";

const sampleRepository = createSampleRepository();
const reviewSchema = z.strictObject({ decision: z.enum(["approved", "rejected"]) });
const outcomeSchema = z.strictObject({
  outcome: z.enum(["contacted", "not-for-me"]).nullable(),
});
const listingSchema = z.strictObject({ status: z.enum(["listed", "hidden"]) });
const visibilitySchema = z.strictObject({ visibility: z.enum(["hidden", "members"]) });

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, headers });
const notFound = () => json({ error: "Operation not found." }, 404);
const notAllowed = (allow: string) =>
  json({ error: "This operation does not accept that method." }, 405, { Allow: allow });

/** Turns an expected refusal into a response that says what went wrong. */
function refusal(error: unknown): Response {
  if (error instanceof InvalidChoiceError)
    return json({ error: error.message, field: error.field, validChoices: error.valid }, 400);
  if (error instanceof AlumniDataError)
    return json(
      { error: error.message, code: error.code },
      error.code === "invalid" ? 400 : error.code === "not-found" ? 404 : 409,
    );
  throw error;
}

function parse<Schema extends z.ZodType>(schema: Schema, input: unknown): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new MembershipError(400, "The request is not valid.");
  return parsed.data;
}

/** Reads the explorer's search from the address. Unknown or malformed values are refused. */
function searchFromQuery(params: URLSearchParams) {
  const known = new Set([
    "q",
    "industry",
    "school",
    "major",
    "city",
    "help",
    "yearFrom",
    "yearTo",
    "sort",
    "includeHidden",
    "offset",
    "limit",
  ]);
  const search: Record<string, string | number | boolean> = {};
  for (const [key, value] of params) {
    if (!known.has(key)) throw new MembershipError(400, "The search is not valid.");
    if (value === "") continue;
    if (["yearFrom", "yearTo", "offset", "limit"].includes(key)) {
      if (!/^\d{1,6}$/.test(value)) throw new MembershipError(400, "The search is not valid.");
      search[key] = Number(value);
    } else if (key === "includeHidden") search[key] = value === "1";
    else search[key] = value;
  }
  return parse(searchSchema, search);
}

export async function alumniApi(
  { context, path, searchParams, method, input }: AppApiProps,
  open: () => AlumniData,
): Promise<Response> {
  const [area, id, action] = path;
  const reading = method === "GET" || method === "HEAD";
  try {
    if (area === "proposals") {
      context.requirePermission("admin");
      if (path.length === 1) {
        if (!reading) return notAllowed("GET, HEAD");
        return json({ proposals: await pendingProposals(open()) });
      }
      if (path.length === 3 && id && action === "review") {
        if (method !== "POST") return notAllowed("POST");
        const { decision } = parse(reviewSchema, input);
        await open().store.reviewChange(id, decision, context.member.id);
        return json({ status: decision });
      }
      return notFound();
    }
    if (area === "import" && path.length === 1) {
      context.requirePermission("admin");
      if (method !== "POST") return notAllowed("POST");
      return json(await importAlumni(open(), parse(importSchema, input), context.member.id));
    }
    if (area === "contacts" && path.length === 3 && id && action === "visibility") {
      context.requirePermission("admin");
      if (method !== "POST") return notAllowed("POST");
      const { visibility } = parse(visibilitySchema, input);
      await open().store.setContactVisibility(id, visibility, context.member.id);
      return json({ visibility });
    }
    if (area === "alumni" && path.length === 3 && id && action === "listing") {
      context.requirePermission("admin");
      if (method !== "POST") return notAllowed("POST");
      const { status } = parse(listingSchema, input);
      await open().store.editField(
        { entity: "alumni_profile", recordId: id, field: "listing_status" },
        status,
        { type: "admin", memberId: context.member.id },
      );
      return json({ status });
    }

    // Everything below is for any member who may use the app.
    context.requirePermission("records.read");
    const viewer = viewerOf(context);
    if (area === "lists" && path.length === 1) {
      if (!reading) return notAllowed("GET, HEAD");
      return json(await open().reads.lists());
    }
    if (area === "alumni" && path.length === 1) {
      if (!reading) return notAllowed("GET, HEAD");
      return json(await open().reads.searchAlumni(viewer, searchFromQuery(searchParams)));
    }
    if (area === "alumni" && path.length === 2 && id) {
      if (!reading) return notAllowed("GET, HEAD");
      const alum = await open().reads.getAlum(viewer, id);
      return alum ? json({ alum }) : json({ error: "No listed alum has that ID." }, 404);
    }
    if (area === "me" && path.length === 1) {
      if (!reading) return notAllowed("GET, HEAD");
      return json({
        name: context.member.name,
        admin: isAdmin(context),
        profile: await open().reads.getStudentProfile(context.member.id),
      });
    }
    if (area === "me" && id === "profile" && path.length === 2) {
      if (method !== "PUT") return notAllowed("PUT");
      const data = open();
      await data.students.saveProfile(context.member, parse(studentAnswersSchema, input));
      return json({ profile: await data.reads.getStudentProfile(context.member.id) });
    }
    if (area === "me" && id === "matches" && path.length === 2) {
      // Reading never changes anything; POST also gives the next set when one is due.
      if (reading) return json({ matches: await open().reads.listMatches(context.member.id) });
      if (method !== "POST") return notAllowed("GET, HEAD, POST");
      return json(await myMatches(open(), context.member.id));
    }
    if (area === "me" && id === "matches" && path.length === 4 && action && path[3] === "outcome") {
      if (method !== "POST") return notAllowed("POST");
      const { outcome } = parse(outcomeSchema, input);
      await open().students.recordOutcome(context.member.id, action, outcome);
      return json({ outcome });
    }
    // The starter's sample records route, kept exactly as it was.
    if (path.length !== 1 || area !== "records") return notFound();
    if (!reading)
      return json({ error: "This starter is read-only. No records were changed." }, 405, {
        Allow: "GET, HEAD",
      });
    return json(await readDirectory(context, sampleRepository));
  } catch (error) {
    return refusal(error);
  }
}
