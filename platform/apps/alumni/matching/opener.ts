// A first message a student can edit before writing to a match.
//
// It is written from the reasons the match was made (see score.ts), turned from "what they have"
// into "what I would say". The app never sends it: the student copies it or opens it in their own
// email. A pure function with no database access, so the screens can use it directly.

/** Each kind of reason score.ts writes, and the same point in the student's own voice. */
const POINTS: [RegExp, (subject: string) => string][] = [
  [/^Works in (.+), an industry you chose$/, (x) => `I’m interested in ${x}, where you work`],
  [
    /^Used to work in (.+), an industry you chose$/,
    (x) => `I’m interested in ${x}, where you used to work`,
  ],
  [/^Offers (.+), which you asked for$/, (x) => `I saw that you’re open to ${x}`],
  [/^Studied (.+), like you$/, (x) => `I’m studying ${x} too`],
  [/^Also studied at (.+)$/, (x) => `I’m studying at ${x} too`],
  [/^Works in (.+), a city you chose$/, (x) => `I’d like to work in ${x}`],
];
/** More than two points makes a first message read like a list. */
const POINTS_USED = 2;

/** One match reason as something the student could say, or null for a reason not known here. */
export function talkingPoint(reason: string): string | null {
  for (const [pattern, say] of POINTS) {
    const subject = pattern.exec(reason)?.[1];
    if (subject) return say(subject);
  }
  return null;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

export function firstMessage(input: {
  studentName: string;
  alumName: string;
  reasons: string[];
}): string {
  const points = input.reasons
    .map(talkingPoint)
    .filter((point): point is string => point !== null)
    .slice(0, POINTS_USED);
  const me = firstName(input.studentName);
  return [
    `Hi ${firstName(input.alumName) || "there"},`,
    `${me ? `I’m ${me}, a` : "I’m a"} member of Slice Consulting at Syracuse University.`,
    points.length ? `${points.join(", and ")}.` : "I found you in the Slice alumni network.",
    "Would you have 20 minutes for a call sometime this month?",
  ].join(" ");
}
