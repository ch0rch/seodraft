#!/usr/bin/env node
/**
 * Smoke-tests the published artifact instead of the checkout.
 *
 * CI's `standalone` job proves the scripts run from a git checkout. That is a
 * weaker claim than it looks: the thing users actually get is the npm tarball,
 * and the tarball's contents are decided by the `files` field in package.json.
 * Drop `src` from that list and every `seodraft install` breaks while the whole
 * test suite stays green, because the suite imports from the checkout.
 *
 * So: pack the package, install the tarball into a throwaway prefix the way npx
 * would, point its bin at a copy of the fixture, and run the installed skill
 * with no node_modules anywhere near the client repo.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

let failed = false;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    const where = options.cwd ? ` (cwd: ${options.cwd})` : "";
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.status}${where}\n${result.stderr ?? ""}${result.stdout ?? ""}`,
    );
  }
  return result.stdout ?? "";
}

function check(label, condition) {
  process.stdout.write(`${condition ? "ok  " : "FAIL"} ${label}\n`);
  if (!condition) failed = true;
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "seodraft-smoke-"));
try {
  // 1. Pack exactly what `npm publish` would upload. npm <=11 reports an array
  // of packed packages, npm >=12 an object keyed by package name.
  const report = JSON.parse(run(npm, ["pack", "--json", "--pack-destination", work], { cwd: repoRoot }));
  const packed = Array.isArray(report) ? report[0] : Object.values(report)[0];
  const tarball = path.join(work, packed.filename);
  const shipped = new Set(packed.files.map((entry) => entry.path));
  check("tarball ships the skill router", shipped.has("skill/SKILL.md"));
  check("tarball ships the installer", shipped.has("src/installer/install.mjs"));
  check("tarball ships the CLI", shipped.has("bin/seodraft.mjs"));
  check(
    "tarball ships no tests",
    [...shipped].every((entry) => !entry.endsWith(".test.mjs")),
  );

  // Pi loads a package's resources straight out of the install directory, so
  // a manifest root missing from `files` means `pi install npm:seodraft`
  // succeeds and registers nothing at all.
  const piManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).pi;
  for (const [type, entries] of Object.entries(piManifest)) {
    for (const entry of entries) {
      const root = entry.replace(/^\.\//, "");
      check(
        `tarball ships the pi ${type} root ${root}`,
        [...shipped].some((packedPath) => packedPath === root || packedPath.startsWith(`${root}/`)),
      );
    }
  }

  // 2. Install the tarball into its own prefix, like npx resolving a version.
  const prefix = path.join(work, "prefix");
  fs.mkdirSync(prefix);
  fs.writeFileSync(path.join(prefix, "package.json"), JSON.stringify({ name: "seodraft-smoke", private: true }) + "\n");
  run(npm, ["install", "--no-audit", "--no-fund", tarball], { cwd: prefix });
  const cli = path.join(prefix, "node_modules", "seodraft", "bin", "seodraft.mjs");
  check("installed package exposes the CLI", fs.existsSync(cli));

  // 3. A client content repo, with no dependencies of its own, ever.
  const site = path.join(work, "site");
  fs.cpSync(path.join(repoRoot, "fixtures", "astro-blog"), site, { recursive: true });
  fs.rmSync(path.join(site, ".claude"), { recursive: true, force: true });

  run(process.execPath, [cli, "install", "--providers=claude", "--scope=project"], { cwd: site });
  const skillDir = path.join(site, ".claude", "skills", "seodraft");
  check("skill lands in the harness folder", fs.existsSync(path.join(skillDir, "SKILL.md")));
  check("reference docs come with it", fs.existsSync(path.join(skillDir, "reference", "write.md")));
  check("client repo stays dependency-free", !fs.existsSync(path.join(site, "node_modules")));

  // 4. The installed scripts run from the client repo, reading its config.
  const state = JSON.parse(run(process.execPath, [path.join(skillDir, "scripts", "state.mjs"), "validate"], { cwd: site }));
  check("state validates in the client repo", state.ok === true);

  const audit = JSON.parse(run(process.execPath, [path.join(skillDir, "scripts", "audit.mjs")], { cwd: site }));
  check("audit reports the fixture's seeded defects", audit.failures.length > 0);

  const gate = spawnSync(
    process.execPath,
    [path.join(skillDir, "scripts", "gate.mjs"), "src/content/blog/deterministic-seo-gates.mdx", "--term", "deterministic seo gates"],
    { cwd: site, encoding: "utf8" },
  );
  check("gate passes the fixture's clean post", gate.status === 0 && JSON.parse(gate.stdout).ok === true);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}

if (failed) {
  process.stderr.write("\nsmoke test failed: the packed artifact is not usable\n");
  process.exit(1);
}
process.stdout.write("\nok: the packed tarball installs and runs in a dependency-free repo\n");
