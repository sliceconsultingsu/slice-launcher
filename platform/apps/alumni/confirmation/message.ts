// The confirmation email's words. A pure function, so the exact text can be tested and shown to
// an admin before anything is sent. The message says only what Slice has on file for the alum's
// job and class year. It never includes an email address, phone number or anyone else's details.

export interface ConfirmationDetails {
  /** The alum's name as written in the directory. */
  fullName: string;
  graduationYear: number;
  /** The current job on file, or null when there is none. */
  job: { title: string; employer: string } | null;
  /** The admin sending the email. Replies go to this person. */
  adminName: string;
}
export interface ConfirmationMessage {
  subject: string;
  text: string;
  html: string;
}

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export function confirmationMessage(details: ConfirmationDetails): ConfirmationMessage {
  const firstName = details.fullName.trim().split(/\s+/)[0] ?? details.fullName;
  const onFile = details.job
    ? `${details.job.title} at ${details.job.employer}`
    : "No current job on record";
  const paragraphs = [
    `Hi ${firstName},`,
    "Slice Consulting keeps a small alumni directory so current consultants can ask alumni for career advice. Only signed-in Slice members can see it.",
    `Here is what we have for you:\n${onFile}\nClass of ${details.graduationYear}`,
    "Could you reply to this email and tell us:\n1. Whether that is still right, or what has changed.\n2. Which contact details you are happy for current consultants to see, such as a personal email or your LinkedIn profile.\n3. Anything you would be glad to help with, such as career advice, resume review or interview practice. This one is optional.",
    "If you would rather not be listed, reply to say so and we will take you out of the directory.",
    `Thank you,\n${details.adminName || "The Slice Consulting team"}\nSlice Consulting`,
  ];
  return {
    subject: "Slice Consulting alumni directory: are your details still right?",
    text: paragraphs.join("\n\n"),
    html: paragraphs
      .map((paragraph) => `<p>${escape(paragraph).replaceAll("\n", "<br>")}</p>`)
      .join("\n"),
  };
}
