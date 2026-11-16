// The app's API routes, under /api/apps/alumni/. The platform has already verified the member
// and their access to the app. Each route checks its own permission before doing anything else,
// then validates its input. Reads never change data; writes arrive as same-origin JSON.
import { z } from "zod";
import { MembershipError } from "../../src/membership/contracts";
import type { AppApiProps } from "../../src/platform/contracts";
import { createSampleRepository, readDirectory } from "./data";
import { InvalidChoiceError } from "./data/reads";
import type { AlumniData } from "./data/services";
import { AlumniDataError } from "./data/store";
import { pendingProposals } from "./refresh/review";

const sampleRepository = createSampleRepository();
const reviewSchema = z.strictObject({ decision: z.enum(["approved", "rejected"]) });

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

export async function alumniApi(
  { context, path, method, input }: AppApiProps,
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
    // The starter's sample records route, kept exactly as it was.
    context.requirePermission("records.read");
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
