#!/usr/bin/env node
// Extract a path-prefix subset of an app.asar into a real directory tree,
// without unpacking the whole archive and without touching the installation.
//
// usage:
//   node scripts/extract-asar-subset.mjs <app.asar> <outDir> [prefix ...]
// example:
//   node scripts/extract-asar-subset.mjs "C:\\DeepSeekHarness\\resources\\app.asar" .\\mirror "dsh/node_modules/@deepseek-ai/"
//
// Prefixes are archive paths; the leading "dsh/" segment is stripped on disk so the
// result looks like the host root (mirror/node_modules/@deepseek-ai/...).
import fs from "node:fs";
import path from "node:path";

const [asarPath, outDir, ...prefixes] = process.argv.slice(2);
if (!asarPath || !outDir) {
  console.error("usage: node scripts/extract-asar-subset.mjs <app.asar> <outDir> [prefix ...]");
  process.exit(2);
}
const wants = prefixes.length > 0 ? prefixes : ["dsh/node_modules/@deepseek-ai/"];

const fd = fs.openSync(asarPath, "r");
const sizeBuf = Buffer.alloc(8);
fs.readSync(fd, sizeBuf, 0, 8, 0);
const headerSize = sizeBuf.readUInt32LE(4);
const hb = Buffer.alloc(headerSize);
fs.readSync(fd, hb, 0, headerSize, 8);
const strLen = hb.readUInt32LE(4);
const header = JSON.parse(hb.slice(8, 8 + strLen).toString("utf8"));
const base = 8 + headerSize;

const entries = [];
(function walk(node, prefix) {
  for (const [name, val] of Object.entries(node.files || {})) {
    const p = prefix ? `${prefix}/${name}` : name;
    if (val.files) walk(val, p);
    else entries.push({ path: p, size: val.size ?? 0, offset: val.offset == null ? null : Number(val.offset) });
  }
})(header, "");

const selected = entries.filter((e) => wants.some((w) => e.path.startsWith(w)));
let written = 0;
let bytes = 0;
for (const e of selected) {
  const dest = path.join(outDir, e.path.replace(/^[^/]+\//, ""));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const buf = Buffer.alloc(e.size);
  if (e.size > 0) fs.readSync(fd, buf, 0, e.size, base + (e.offset ?? 0));
  fs.writeFileSync(dest, buf);
  written++;
  bytes += e.size;
}
fs.closeSync(fd);
console.log(`entries=${entries.length} selected=${written} bytes=${bytes} -> ${path.resolve(outDir)}`);
