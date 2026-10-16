import { readFile } from "node:fs/promises";
import { text } from "./core.mjs";

const DIGEST_SOURCE = "docs/design-profile.md";
const DIGEST_START = "<!-- reviewer-digest:start -->";
const DIGEST_END = "<!-- reviewer-digest:end -->";
export const DIGEST_LIMIT = 1600;

// Only the profile's digest is trusted reviewer input; the full profile would exceed the standards budget.
export function extractDigest(markdown) {
  const start = markdown.indexOf(DIGEST_START);
  const end = markdown.indexOf(DIGEST_END);
  if (
    start === -1 ||
    end < start ||
    markdown.indexOf(DIGEST_START, start + 1) !== -1 ||
    markdown.indexOf(DIGEST_END, end + 1) !== -1
  )
    throw new Error("Design digest markers missing or duplicated");
  const digest = markdown.slice(start + DIGEST_START.length, end).trim();
  if (!digest) throw new Error("Design digest empty");
  if (digest.length > DIGEST_LIMIT) throw new Error("Design digest too long");
  return digest;
}

export async function loadStandards(read = readFile) {
  const paths = [
    "AGENTS.md",
    "CONTRIBUTING.md",
    "docs/architecture.md",
    "docs/security-review.md",
    "docs/data-boundary.md",
  ];
  const contents = await Promise.all(
    paths.map(async (path) => {
      const content = await read(path, "utf8");
      if (!content.trim()) throw new Error("Required trusted standards empty");
      return path + "\n" + content;
    }),
  );
  const digest = extractDigest(await read(DIGEST_SOURCE, "utf8"));
  contents.push(`${DIGEST_SOURCE} (reviewer digest)\n${digest}`);
  return text(contents.join("\n"), 30000);
}
