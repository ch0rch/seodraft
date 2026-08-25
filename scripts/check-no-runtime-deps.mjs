#!/usr/bin/env node
/**
 * Guards the product's hardest constraint: everything under `skill/scripts/`
 * runs inside someone else's AI harness, invoked as `node scripts/gate.mjs`,
 * with no install step and no `node_modules` anywhere near it. A single
 * third-party import there breaks every install, so it is checked
 * mechanically instead of being left to code review.
 *
 * Allowed specifiers: `node:` builtins and relative paths. Nothing else.
 * Test files are exempt — they never ship.
 *
 *   node scripts/check-no-runtime-deps.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scanRoot = path.join(root, "skill", "scripts");

// `from "spec"` in a static import/export, and `import("spec")`.
const STATIC_RE = /\b(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/g;
const BARE_IMPORT_RE = /\bimport\s*["']([^"']+)["']/g;
const DYNAMIC_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const REQUIRE_RE = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".mjs") && !entry.name.endsWith(".test.mjs")) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(scanRoot)) {
  const source = fs.readFileSync(file, "utf8");
  for (const re of [STATIC_RE, BARE_IMPORT_RE, DYNAMIC_RE, REQUIRE_RE]) {
    for (const match of source.matchAll(re)) {
      const spec = match[1];
      const allowed = spec.startsWith("node:") || spec.startsWith("./") || spec.startsWith("../");
      if (!allowed) offenders.push({ file: path.relative(root, file), spec });
    }
  }
}

if (offenders.length > 0) {
  process.stderr.write("skill/scripts may only import node: builtins or relative paths.\n\n");
  for (const { file, spec } of offenders) process.stderr.write(`  ${file}: ${JSON.stringify(spec)}\n`);
  process.stderr.write("\nSee CONTRIBUTING.md — 'The one hard rule'.\n");
  process.exit(1);
}

const count = walk(scanRoot).length;
process.stdout.write(`ok: ${count} script(s) under skill/scripts import only node: builtins and relative paths\n`);
