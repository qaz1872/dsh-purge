#!/usr/bin/env node
// dsh-purge anchor audit — checks every patch anchor against a real DSH tree.
//
// usage:
//   node scripts/audit-anchors.mjs <AI_BASE> [out.json]
//   DSH_AI_BASE=/path/to/node_modules/@deepseek-ai node scripts/audit-anchors.mjs
//
// AI_BASE is the host's node_modules/@deepseek-ai (unpacked app dir, mirror, or
// extracted copy). Nothing is written except the optional JSON report.
//
// 统计口径 / verdict rules:
//   apply   — pattern has no "[dsh-purge", replace carries it → must hit on a clean host
//   cleanup — pattern carries "[dsh-purge", replace is official text → only fires after an
//             earlier version wrote our marker; a miss on a clean host is expected
//   REAL MISS — apply-direction patch with zero matches = anchor went stale upstream
import fs from "node:fs";
import { ALL_PATCHES, targetFiles } from "../lib/core.js";

const aiBase = process.argv[2] || process.env.DSH_AI_BASE;
if (!aiBase) {
  console.error("usage: node scripts/audit-anchors.mjs <AI_BASE> [out.json]");
  process.exit(2);
}
const outJson = process.argv[3] || "audit.json";
const dshHome = process.env.DSH_HOME;

const files = dshHome === undefined ? targetFiles(aiBase) : targetFiles(aiBase, dshHome);

function targetsOf(patch) {
  const keys = Array.isArray(patch.file) ? patch.file : [patch.file];
  const out = [];
  for (const k of keys) {
    const v = files[k];
    if (!v) continue;
    for (const fp of Array.isArray(v) ? v : [v]) {
      if (fp && fs.existsSync(fp) && fs.statSync(fp).isFile()) out.push({ key: k, fp });
    }
  }
  return out;
}

function patsOf(patch) {
  const out = [];
  for (const r of patch.replacements || []) if (r && r.pattern != null) out.push({ pat: r.pattern, rep: r.replace });
  for (const x of patch.patterns || []) out.push({ pat: x, rep: undefined });
  return out;
}

function matches(pat, text) {
  if (typeof pat === "string") return text.includes(pat);
  return new RegExp(pat.source, pat.flags).test(text);
}

const rows = [];
for (const p of ALL_PATCHES) {
  const targets = targetsOf(p);
  const texts = targets.map((t) => fs.readFileSync(t.fp, "utf8"));
  const row = {
    id: p.id, name: p.name, layer: p.layer, optional: !!p.optional,
    targetKeys: Array.isArray(p.file) ? p.file : [p.file],
    targets: targets.length, hit: 0, miss: 0, apply: 0, cleanup: 0, marked: false,
  };
  for (const t of texts) {
    if ((p.markers || []).some((m) => typeof m === "string" && m && t.includes(m))) row.marked = true;
  }
  for (const { pat, rep } of patsOf(p)) {
    const patMarked = typeof pat === "string" && pat.includes("[dsh-purge");
    const repMarked = typeof rep === "string" && rep.includes("[dsh-purge");
    if (patMarked && !repMarked) row.cleanup++;
    else row.apply++;
    if (texts.some((t) => matches(pat, t))) row.hit++;
    else row.miss++;
  }
  rows.push(row);
}

fs.writeFileSync(outJson, JSON.stringify(rows, null, 1));

const real = rows.filter((r) => !r.optional && r.targets > 0 && r.hit === 0 && r.apply > 0);
const noTarget = rows.filter((r) => r.targets === 0);
const partial = rows.filter((r) => r.hit > 0 && r.miss > 0);
const clean = rows.filter((r) => r.targets > 0 && r.miss === 0);

console.log(`patches=${rows.length} clean=${clean.length} partial=${partial.length} REAL_MISS=${real.length} noTarget=${noTarget.length}`);
console.log("--- real miss (stale anchor, apply direction) ---");
for (const r of real) console.log(`  #${r.id} ${r.name} [${r.layer}] targets=${r.targets} apply=${r.apply} miss=${r.miss}`);
console.log("--- partial ---");
for (const r of partial) console.log(`  #${r.id} ${r.name} hit=${r.hit} miss=${r.miss}`);
console.log("--- no target (package absent in this host) ---");
for (const r of noTarget) console.log(`  #${r.id} ${r.name} file=${JSON.stringify(r.targetKeys)}`);
console.log(`report: ${outJson}`);
