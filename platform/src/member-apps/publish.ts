// Reads what a builder's AI sends to publish a version, and refuses anything the launcher would
// not serve. Every refusal is a sentence the AI can act on.
import { z } from "zod";
import { MembershipError } from "../membership/contracts";
import type { StoredFile } from "./files";

export const MAX_FILES = 50;
export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_BUNDLE_BYTES = 1024 * 1024;
export const MAX_GUIDE = 20_000;

/** The file types an app can publish, and how the launcher serves each. */
const TEXT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  svg: "image/svg+xml",
};
const BINARY_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff2: "font/woff2",
};
const allowed = [...Object.keys(TEXT_TYPES), ...Object.keys(BINARY_TYPES)].join(", ");

// Folders and names of letters, digits, dots, hyphens and underscores. Each starts with a letter
// or digit, so nothing can be hidden (".env"), climb out ("..") or start from the root.
export const pathPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

const input = z.strictObject({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(200),
  guide: z.string().trim().min(1).max(MAX_GUIDE),
  powers: z
    .array(z.strictObject({ id: z.string().max(80), label: z.string().max(200) }))
    .max(20)
    .default([]),
  files: z
    .array(
      z.strictObject({
        path: z.string().max(200),
        text: z.string().optional(),
        base64: z.string().optional(),
      }),
    )
    .max(1000),
});

export interface Bundle {
  name: string;
  description: string;
  guide: string;
  powers: { id: string; label: string }[];
  files: StoredFile[];
}

function refuse(message: string): never {
  throw new MembershipError(400, message);
}

function decode(path: string, base64: string): Uint8Array {
  const compact = base64.replace(/\s+/g, "");
  if (compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact))
    refuse(`"${path}" is not valid base64.`);
  return Uint8Array.from(atob(compact), (character) => character.charCodeAt(0));
}

export function readBundle(value: unknown): Bundle {
  const parsed = input.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(".");
    refuse(`${where ? `${where}: ` : ""}${issue?.message ?? "Invalid publish request."}`);
  }
  const { name, description, guide, powers } = parsed.data;
  if (parsed.data.files.length === 0) refuse("Publish at least one file, including index.html.");
  if (parsed.data.files.length > MAX_FILES)
    refuse(`An app can have up to ${MAX_FILES} files in one publish.`);
  const seen = new Set<string>();
  const files: StoredFile[] = [];
  let total = 0;
  for (const file of parsed.data.files) {
    const { path } = file;
    if (!pathPattern.test(path))
      refuse(
        `"${path.slice(0, 80)}" is not a usable file path. Use letters, digits, dots, hyphens and underscores, with / between folders.`,
      );
    if (/^api(\/|$)/i.test(path))
      refuse(`"${path}": addresses under api/ are kept for an app's server code.`);
    if (path.toLowerCase() === "worker.js")
      refuse("Server code (worker.js) is not switched on yet. Publish screens only.");
    if (seen.has(path.toLowerCase())) refuse(`"${path}" is listed twice.`);
    seen.add(path.toLowerCase());
    const extension = /\.([A-Za-z0-9]+)$/.exec(path)?.[1].toLowerCase() ?? "";
    const type = TEXT_TYPES[extension] ?? BINARY_TYPES[extension];
    if (!type) refuse(`"${path}" is not a file type an app can publish. Allowed: ${allowed}.`);
    if ((file.text === undefined) === (file.base64 === undefined))
      refuse(`"${path}": give each file either text or base64, not both.`);
    if (file.base64 === undefined && extension in BINARY_TYPES)
      refuse(`"${path}" must be sent as base64.`);
    const body =
      file.base64 === undefined ? new TextEncoder().encode(file.text) : decode(path, file.base64);
    if (body.byteLength > MAX_FILE_BYTES) refuse(`"${path}" is larger than 512 KB.`);
    total += body.byteLength;
    files.push({ path, type, body });
  }
  if (total > MAX_BUNDLE_BYTES) refuse("The files add up to more than 1 MB.");
  if (!files.some((file) => file.path === "index.html"))
    refuse("An app needs an index.html: it is the first screen.");
  return { name, description, guide, powers, files };
}
