// Minimal asar reader: parse header, list entries, extract single file.
// usage: node asar-probe.mjs list <asar> <out.json>
//        node asar-probe.mjs cat <asar> <inner/path>
//        node asar-probe.mjs grep <asar> <substr>
import fs from "node:fs";

const [cmd, asarPath, arg] = process.argv.slice(2);
const fd = fs.openSync(asarPath, "r");

function readHeader() {
  const b = Buffer.alloc(8);
  fs.readSync(fd, b, 0, 8, 0);
  const size = b.readUInt32LE(4);
  const hb = Buffer.alloc(size);
  fs.readSync(fd, hb, 0, size, 8);
  const strLen = hb.readUInt32LE(4);
  const json = hb.slice(8, 8 + strLen).toString("utf8");
  return { header: JSON.parse(json), base: 8 + size };
}

const { header, base } = readHeader();

function walk(node, prefix, out) {
  for (const [name, val] of Object.entries(node.files || {})) {
    const p = prefix ? `${prefix}/${name}` : name;
    if (val.files) walk(val, p, out);
    else out.push({ path: p, size: val.size ?? 0, offset: val.offset ? Number(val.offset) : null, unpacked: !!val.unpacked });
  }
  return out;
}

function readFile(entry) {
  const buf = Buffer.alloc(entry.size);
  fs.readSync(fd, buf, 0, entry.size, base + (entry.offset ?? 0));
  return buf;
}

const all = walk(header, "", []);

if (cmd === "list") {
  fs.writeFileSync(arg, JSON.stringify(all.map((e) => e.path), null, 0));
  console.log(`entries=${all.length} -> ${arg}`);
  const byTop = {};
  for (const e of all) {
    const top = e.path.includes("/") ? e.path.split("/")[0] : "(root)";
    byTop[top] = (byTop[top] || 0) + 1;
  }
  console.log(Object.entries(byTop).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k}:${v}`).join("  "));
} else if (cmd === "cat") {
  const hits = all.filter((e) => e.path === arg || e.path.endsWith("/" + arg));
  if (!hits.length) { console.error("not found: " + arg); process.exit(2); }
  const e = hits[0];
  console.log(`### ${e.path} (${e.size}B)`);
  process.stdout.write(readFile(e));
} else if (cmd === "grep") {
  const nameHit = all.filter((e) => e.path.toLowerCase().includes(arg.toLowerCase()));
  console.log(`path-matches=${nameHit.length}`);
  for (const e of nameHit.slice(0, 40)) console.log(`  ${e.path}  ${e.size}B`);
}
