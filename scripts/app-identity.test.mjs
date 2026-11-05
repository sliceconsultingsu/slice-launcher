import { test } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { deflateSync } from "node:zlib";
import {
  ICON_README_PLACEHOLDER,
  checkGuide,
  checkIconReadme,
  starterGuide,
  starterIcon,
  validateIcon,
} from "./app-identity.mjs";

const svg = (body, attributes = 'viewBox="0 0 64 64"') =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${body}</svg>`);

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}
function chunk(type, data = Buffer.alloc(0)) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function png({ size = 512, colorType = 2, extra = [] } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = colorType;
  const row = Buffer.alloc(1 + size * 3);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: size }, () => row)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    ...extra,
    chunk("IDAT", pixels),
    chunk("IEND"),
  ]);
}

test("accepts square, self-contained SVG artwork with local gradients", () => {
  validateIcon(
    "icon.svg",
    svg(
      '<defs><linearGradient id="a"><stop offset="0" stop-color="#f60"/></linearGradient></defs>' +
        '<rect width="64" height="64" fill="url(#a)"/><path d="M0 0L64 64" stroke="#222"/>',
    ),
  );
});

test("rejects SVG content that could run code, load other files or animate", () => {
  for (const [body, reason] of [
    ["<script>alert(1)</script>", /not allowed/],
    ['<rect width="1" height="1" onclick="alert(1)"/>', /not allowed/],
    ['<a href="https://example.test"><rect width="1" height="1"/></a>', /not allowed/],
    ['<use href="https://example.test/x.svg#a"/>', /local/],
    ['<rect width="1" height="1" fill="url(https://example.test/a)"/>', /local/],
    ['<image href="#a"/>', /not allowed/],
    ["<foreignObject/>", /not allowed/],
    ["<style>rect{fill:red}</style>", /not allowed/],
    ['<animate attributeName="x"/>', /not allowed/],
    ['<rect width="1" height="1" style="fill:url(https://example.test)"/>', /not allowed/],
  ])
    assert.throws(() => validateIcon("icon.svg", svg(body)), reason, body);
});

test("rejects malformed, entity-bearing, non-square and oversized SVG files", () => {
  assert.throws(() => validateIcon("icon.svg", Buffer.from("<svg")), /valid XML/);
  assert.throws(
    () =>
      validateIcon(
        "icon.svg",
        Buffer.from(
          '<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>',
        ),
      ),
    /DOCTYPE/,
  );
  assert.throws(() => validateIcon("icon.svg", svg("", 'viewBox="0 0 64 32"')), /square/);
  assert.throws(() => validateIcon("icon.svg", svg("", "")), /square/);
  assert.throws(() => validateIcon("icon.svg", Buffer.from("<rect/>")), /root/);
  assert.throws(() => validateIcon("icon.svg", svg(`<!--${" ".repeat(32 * 1024)}-->`)), /32 KiB/);
});

test("accepts opaque 512px PNG icons and rejects metadata, alpha and animation", () => {
  validateIcon("icon.png", png());
  assert.throws(() => validateIcon("icon.png", png({ size: 256 })), /512/);
  assert.throws(() => validateIcon("icon.png", png({ colorType: 6 })), /RGB/);
  for (const type of ["tEXt", "iTXt", "zTXt", "eXIf", "acTL"])
    assert.throws(
      () => validateIcon("icon.png", png({ extra: [chunk(type, Buffer.from("x"))] })),
      new RegExp(type),
    );
  assert.throws(() => validateIcon("icon.png", Buffer.from("not a png")), /PNG/);
  assert.throws(() => validateIcon("icon.png", Buffer.alloc(150 * 1024 + 1)), /150 KiB/);
});

test("starter icon is valid artwork but must be replaced before review", () => {
  validateIcon("icon.svg", Buffer.from(starterIcon));
  assert.throws(
    () => validateIcon("icon.svg", Buffer.from(starterIcon), { app: "notes" }),
    /starter/,
  );
});

test("guides must be written for consultants without raw HTML", () => {
  checkGuide("notes", "# Notes\n\nUse Notes to record client meetings.\n");
  assert.throws(() => checkGuide("notes", starterGuide("Notes")), /starter/);
  assert.throws(() => checkGuide("notes", "# Notes\n\n<script>x</script>\n"), /raw HTML/);
  assert.throws(() => checkGuide("notes", "# Notes\n\n<b>bold</b>\n"), /raw HTML/);
  assert.throws(() => checkGuide("notes", ""), /empty/);
  assert.throws(() => checkGuide("notes", "Notes without a title.\n"), /title/);
  assert.throws(() => checkGuide("notes", "x".repeat(32 * 1024 + 1)), /32 KiB/);
  checkGuide("notes", "# Notes\n\nCompare `a < b` and use 3 > 2.\n");
});

test("app READMEs record where the icon came from", () => {
  checkIconReadme("notes", "# Notes\n\n## Icon\n\nOriginal artwork by Example Author, MIT.\n");
  assert.throws(() => checkIconReadme("notes", "# Notes\n"), /## Icon/);
  assert.throws(() => checkIconReadme("notes", "# Notes\n\n## Icon\n\n## Files\n"), /## Icon/);
  assert.throws(
    () => checkIconReadme("notes", `# Notes\n\n## Icon\n\n${ICON_README_PLACEHOLDER}\n`),
    /## Icon/,
  );
});
