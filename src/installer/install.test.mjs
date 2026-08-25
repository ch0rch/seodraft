import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectProviders, installSkill } from "./install.mjs";
import { copyFixture, repoRoot } from "../../tests/helpers.mjs";

let tempRoot = null;
afterEach(() => {
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

describe("installer", () => {
  it("installs the skill for claude into a project and preserves unrelated files", () => {
    tempRoot = copyFixture();
    fs.mkdirSync(path.join(tempRoot, ".claude", "skills", "other-skill"), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, ".claude", "skills", "other-skill", "SKILL.md"), "# other\n");

    const installed = installSkill({ providerIds: ["claude"], base: tempRoot, packageRoot: repoRoot });
    expect(installed).toHaveLength(1);

    const skillDir = path.join(tempRoot, ".claude", "skills", "seodraft");
    expect(fs.existsSync(path.join(skillDir, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillDir, "scripts", "gate.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(skillDir, "scripts", "lib", "frontmatter.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(skillDir, "reference", "write.md"))).toBe(true);

    // Unrelated content survives.
    expect(fs.existsSync(path.join(tempRoot, ".claude", "skills", "other-skill", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(tempRoot, "astro.config.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(tempRoot, ".seodraft", "config.json"))).toBe(true);

    // Dev-only test files are never shipped.
    expect(fs.existsSync(path.join(skillDir, "scripts", "gate.test.mjs"))).toBe(false);
  });

  it("update is a re-copy over an existing install", () => {
    tempRoot = copyFixture();
    installSkill({ providerIds: ["claude"], base: tempRoot, packageRoot: repoRoot });
    const marker = path.join(tempRoot, ".claude", "skills", "seodraft", "SKILL.md");
    fs.writeFileSync(marker, "locally modified\n");
    installSkill({ providerIds: ["claude"], base: tempRoot, packageRoot: repoRoot });
    expect(fs.readFileSync(marker, "utf8")).not.toBe("locally modified\n");
  });

  it("detects providers by harness folder presence", () => {
    tempRoot = copyFixture();
    fs.mkdirSync(path.join(tempRoot, ".claude"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, ".cursor"), { recursive: true });
    expect(detectProviders(tempRoot)).toEqual(["claude", "cursor"]);
  });

  it("rejects unknown providers", () => {
    tempRoot = copyFixture();
    expect(() => installSkill({ providerIds: ["zed"], base: tempRoot, packageRoot: repoRoot })).toThrow(/unknown provider/);
  });
});

describe("install source", () => {
  it("always installs the current skill/, never a prebuilt copy", () => {
    // Regression: the installer used to prefer `dist/<provider>/...` when it
    // existed, so any edit to `skill/` made after the last build was silently
    // served stale. A `dist/` left lying around must now be ignored.
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "seodraft-pkg-"));
    const pkgRoot = path.join(tempRoot, "pkg");
    fs.mkdirSync(path.join(pkgRoot, "skill"), { recursive: true });
    fs.writeFileSync(path.join(pkgRoot, "skill", "SKILL.md"), "CURRENT\n");
    const stale = path.join(pkgRoot, "dist", "claude", ".claude", "skills", "seodraft");
    fs.mkdirSync(stale, { recursive: true });
    fs.writeFileSync(path.join(stale, "SKILL.md"), "STALE\n");

    const base = path.join(tempRoot, "project");
    fs.mkdirSync(base, { recursive: true });
    installSkill({ providerIds: ["claude"], base, packageRoot: pkgRoot });

    const installed = fs.readFileSync(path.join(base, ".claude", "skills", "seodraft", "SKILL.md"), "utf8");
    expect(installed).toBe("CURRENT\n");
  });
});
