// Clear errors for assistant tools. The platform replaces anything a tool throws with one generic
// message, so an assistant could not tell "not found" from "invalid choice". Expected refusals are
// therefore returned as an ordinary result that says what went wrong. Unexpected errors are still
// thrown, and still reach the assistant only as the platform's generic message.
import { InvalidChoiceError } from "./data/reads";
import { AlumniDataError } from "./data/store";

export async function toolErrors<Result extends Record<string, unknown>>(
  run: () => Promise<Result>,
): Promise<Result | Record<string, unknown>> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof InvalidChoiceError)
      return {
        status: "invalid_choice",
        field: error.field,
        message: error.message,
        validChoices: error.valid,
      };
    if (error instanceof AlumniDataError)
      return { status: error.code.replace("-", "_"), message: error.message };
    throw error;
  }
}
