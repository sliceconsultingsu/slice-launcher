// The one place the alumni app reaches the real database. The alumni tables live in the
// platform's private database, alongside membership. Everything else in the app receives the
// result as an argument and never touches the Workers environment itself.
import { env } from "cloudflare:workers";
import { alumniData, type AlumniData } from "./services";

export function openAlumniData(): AlumniData {
  return alumniData(env.MEMBERSHIP_DB);
}
