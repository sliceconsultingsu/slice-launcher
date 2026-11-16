// What the app needs from a mail service: one call that sends one message. The real one is
// Cloudflare's email binding (see runtime.ts). Tests and the team preview pass a stand-in that
// records messages and sends nothing.
export interface OutgoingEmail {
  to: string;
  from: { email: string; name: string };
  replyTo: string;
  subject: string;
  text: string;
  html: string;
}
export interface EmailSender {
  send(message: OutgoingEmail): Promise<{ messageId: string }>;
}
export interface Mailer {
  sender: EmailSender;
  /** The address confirmation emails come from. It must be on a domain set up for sending. */
  from: string;
}

export function isEmailSender(value: unknown): value is EmailSender {
  return (
    typeof value === "object" &&
    value !== null &&
    "send" in value &&
    typeof value.send === "function"
  );
}
