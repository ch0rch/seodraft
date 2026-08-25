/**
 * Installer core. Copies the skill build into detected harness folders.
 * Pure-ish: all environment dependencies (cwd, home) are parameters so the
 * whole flow is testable against a temp directory.
 *
 * Safety invariant: only ever writes inside
 * `<harness>/skills/seodraft/` — unrelated files and other skills are
 * never touched or deleted.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROVIDERS, PROVIDER_IDS, skillDirFor, PRODUCT_NAME } from "./providers.mjs";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Source of the skill content. There is exactly one: `skill/`.
 *
 * An earlier design copied `skill/` into `dist/<provider>/...` first and
 * installed from there. That indirection bought nothing — `installSkill`
 * derives the destination from `skillDirFor(id)` itself, so only the
 * CONTENT is ever copied, never the layout — and it silently served stale
 * files whenever `dist/` predated an edit to `skill/`. One source, no
 * staleness. If a provider ever needs genuinely different content, add the
 * seam back then, for that reason.
 */
export function sourceDir(packageRoot = PACKAGE_ROOT) {
  return path.join(packageRoot, "skill");
}

/** Providers whose harness folder exists at `base` (project root or $HOME). */
export function detectProviders(base) {
  return PROVIDER_IDS.filter((id) => fs.existsSync(path.join(base, PROVIDERS[id].harnessDir)));
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name.endsWith(".test.mjs")) continue; // dev-only, never shipped
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

/**
 * Install (or update — same operation, install is idempotent) the skill for
 * `providerIds` under `base`. Returns the list of `{ provider, dest }`.
 */
export function installSkill({ providerIds, base, packageRoot = PACKAGE_ROOT }) {
  const installed = [];
  for (const id of providerIds) {
    if (!PROVIDERS[id]) throw new Error(`unknown provider "${id}" (known: ${PROVIDER_IDS.join(", ")})`);
    const dest = path.join(base, skillDirFor(id));
    copyDir(sourceDir(packageRoot), dest);
    installed.push({ provider: id, dest });
  }
  return installed;
}

/** Resolve `--scope` to the base directory installs land in. */
export function baseForScope(scope, cwd = process.cwd()) {
  if (scope === "global") return os.homedir();
  return cwd;
}

/** Interactive confirmation — skipped when flags preselect providers or
 * stdin is not a TTY (CI). */
async function confirm(question) {
  if (!process.stdin.isTTY) return true;
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [Y/n] `)).trim().toLowerCase();
  rl.close();
  return answer === "" || answer === "y" || answer === "yes";
}

export async function runInstall({ providersFlag, scope, cwd = process.cwd() }) {
  const base = baseForScope(scope, cwd);
  let providerIds;
  let prompted = false;

  if (providersFlag) {
    providerIds = providersFlag.split(",").map((p) => p.trim()).filter(Boolean);
  } else {
    providerIds = detectProviders(base);
    prompted = true;
  }

  if (providerIds.length === 0) {
    const known = PROVIDER_IDS.map((id) => PROVIDERS[id].harnessDir).join(", ");
    process.stderr.write(`No harness folders detected in ${base} (looked for: ${known}).\n`);
    process.stderr.write(`Pass --providers=claude,cursor,... to install anyway.\n`);
    return 1;
  }

  if (prompted) {
    const labels = providerIds.map((id) => `${PROVIDERS[id].label} (${PROVIDERS[id].harnessDir})`).join(", ");
    const ok = await confirm(`Install ${PRODUCT_NAME} for: ${labels}?`);
    if (!ok) {
      process.stderr.write("Aborted.\n");
      return 1;
    }
  }

  const installed = installSkill({ providerIds, base });
  for (const { provider, dest } of installed) {
    process.stdout.write(`installed ${PRODUCT_NAME} for ${PROVIDERS[provider].label} -> ${dest}\n`);
  }
  process.stdout.write(`\nNext step: open your agent in your content repo and run /${PRODUCT_NAME} init\n`);
  return 0;
}
