// App icons and guides are public files served from the platform's own origin. Opening an SVG
// directly runs it as a document there, so icons are checked against an allowlist with a real
// XML parser, never with pattern matching alone.
import { Buffer } from "node:buffer";
import { SaxesParser } from "saxes";

export const SVG_LIMIT = 32 * 1024;
export const PNG_LIMIT = 150 * 1024;
export const GUIDE_LIMIT = 32 * 1024;
const STARTER_GUIDE_MARKER = "Replace this starter guide";
export const ICON_README_PLACEHOLDER =
  "Replace this line: who made the icon, how (original, adapted from a named source, or generated with a named tool), and its licence.";

// Square, full-bleed placeholder written by `pnpm app:create`. CI rejects it in a real app.
export const starterIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#e5e4df"/>
  <rect x="20" y="20" width="24" height="24" rx="6" fill="#666962"/>
</svg>
`;

export function starterGuide(name) {
  return `# ${name.replace(/[\r\n]/g, " ")}

${STARTER_GUIDE_MARKER} with what consultants need to know before opening the app.

## What it is for

One or two sentences: who the app helps and the problem it solves.

## Main tasks

1. The first thing most people do, step by step.
2. The next most common task.

## Getting access

Which permissions a maintainer grants, and who to ask.
`;
}

const svgElements = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "use",
  "title",
  "desc",
]);
const svgAttributes = new Set([
  "xmlns",
  "xmlns:xlink",
  "version",
  "viewBox",
  "preserveAspectRatio",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "fx",
  "fy",
  "d",
  "points",
  "id",
  "transform",
  "opacity",
  "fill",
  "fill-opacity",
  "fill-rule",
  "clip-rule",
  "clip-path",
  "mask",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-opacity",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "clipPathUnits",
  "maskUnits",
  "maskContentUnits",
  "href",
  "xlink:href",
]);

function validateSvg(buffer) {
  if (buffer.length > SVG_LIMIT) throw new Error("SVG icons must be 32 KiB or smaller");
  const parser = new SaxesParser();
  let root;
  parser.on("doctype", () => {
    throw new Error("SVG icons cannot contain a DOCTYPE or entity declarations");
  });
  parser.on("processinginstruction", () => {
    throw new Error("SVG icons cannot contain processing instructions");
  });
  parser.on("cdata", () => {
    throw new Error("SVG icons cannot contain CDATA sections");
  });
  parser.on("opentag", (node) => {
    root ??= node;
    if (!svgElements.has(node.name)) throw new Error(`SVG element <${node.name}> is not allowed`);
    for (const [name, value] of Object.entries(node.attributes)) {
      if (!svgAttributes.has(name)) throw new Error(`SVG attribute ${name} is not allowed`);
      if ((name === "href" || name === "xlink:href") && !value.startsWith("#"))
        throw new Error("SVG references must be local (#id)");
      for (const match of value.matchAll(/url\(\s*([^)]*)\)/gi))
        if (!match[1].replace(/^['"]/, "").startsWith("#"))
          throw new Error("SVG paint references must be local url(#id)");
    }
  });
  try {
    // Throws on malformed XML and undefined entities; only XML's predefined entities exist.
    parser.write(buffer.toString("utf8")).close();
  } catch (error) {
    if (/not allowed|DOCTYPE|processing|CDATA|local/.test(error.message)) throw error;
    throw new Error(`SVG icons must be valid XML: ${error.message}`, { cause: error });
  }
  if (root?.name !== "svg") throw new Error("SVG icons need an <svg> root element");
  const box = String(root.attributes.viewBox ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (box.length !== 4 || box.some((n) => !Number.isFinite(n)) || box[2] <= 0 || box[2] !== box[3])
    throw new Error("SVG icons must be square: viewBox width must equal its height");
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const forbiddenChunks = new Set(["tEXt", "iTXt", "zTXt", "eXIf", "acTL"]);

function validatePng(buffer) {
  if (buffer.length > PNG_LIMIT) throw new Error("PNG icons must be 150 KiB or smaller");
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE))
    throw new Error("PNG icons must be valid PNG files");
  let offset = 8;
  let first = true;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    if (offset + 12 + length > buffer.length) throw new Error("PNG icons must be valid PNG files");
    if (first) {
      if (type !== "IHDR" || length !== 13) throw new Error("PNG icons must be valid PNG files");
      const data = buffer.subarray(offset + 8, offset + 21);
      if (data.readUInt32BE(0) !== 512 || data.readUInt32BE(4) !== 512)
        throw new Error("PNG icons must be 512×512 pixels");
      if (data[9] !== 2)
        throw new Error("PNG icons must be RGB with no transparency (colour type 2)");
      first = false;
    }
    if (forbiddenChunks.has(type))
      throw new Error(`PNG icons cannot contain ${type} metadata or animation chunks`);
    if (type === "IEND") return;
    offset += 12 + length;
  }
  throw new Error("PNG icons must be valid PNG files");
}

/** Validates an icon file. With `app`, also rejects the unchanged scaffold placeholder. */
export function validateIcon(file, buffer, { app } = {}) {
  if (file.endsWith(".svg")) validateSvg(buffer);
  else if (file.endsWith(".png")) validatePng(buffer);
  else throw new Error("Icons must be icon.svg or icon.png");
  if (app && buffer.equals(Buffer.from(starterIcon)))
    throw new Error(`${app}: replace the starter icon.svg with the app's own icon`);
}

export function checkGuide(app, text) {
  if (Buffer.byteLength(text) > GUIDE_LIMIT)
    throw new Error(`${app}: guide.md must be 32 KiB or smaller`);
  if (!text.trim()) throw new Error(`${app}: guide.md is empty`);
  if (!/^# \S/.test(text.trimStart()))
    throw new Error(`${app}: guide.md must start with a "# " title; it becomes the page heading`);
  if (text.includes(STARTER_GUIDE_MARKER))
    throw new Error(`${app}: replace the starter guide.md with instructions for consultants`);
  // Code is shown literally, so only prose outside code fences and spans is checked.
  const prose = text
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "")
    .replace(/`[^`\n]*`/g, "");
  if (/<[A-Za-z!/?]/.test(prose))
    throw new Error(
      `${app}: guide.md cannot contain raw HTML; use Markdown or wrap code in backticks`,
    );
}

export function checkIconReadme(app, readme) {
  const section = /^## Icon[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(readme);
  if (!section?.[1].trim() || section[1].includes(ICON_README_PLACEHOLDER))
    throw new Error(
      `${app}: README.md needs an "## Icon" section saying who made the icon, how, and its licence`,
    );
}
