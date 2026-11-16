// The one place confirmation emails reach the real mail service. The Worker needs two settings,
// added by the maintainer when email is switched on: an email binding named ALUMNI_EMAIL and the
// sending address in ALUMNI_EMAIL_FROM. Until both exist this returns null, the screen says
// email is not set up, and nothing can be sent.
import { env } from "cloudflare:workers";
import { isEmailSender, type Mailer } from "./mail";

export function openMailer(): Mailer | null {
  const sender: unknown = Reflect.get(env, "ALUMNI_EMAIL");
  const from: unknown = Reflect.get(env, "ALUMNI_EMAIL_FROM");
  if (!isEmailSender(sender) || typeof from !== "string" || !/^[^\s@]+@[^\s@]+$/.test(from))
    return null;
  return { sender, from };
}
