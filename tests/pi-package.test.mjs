/**
 * Distribution contract for the Pi package route (`pi install npm:seodraft`).
 *
 * Pi loads resources declared under the `pi` key in package.json straight out
 * of the installed package — nothing is copied. So the manifest, the tarball
 * `files` list and the prompt-template syntax are part of the shipped product
 * and are asserted here.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDocument } from "../skill/scripts/lib/frontmatter.mjs";
import { repoRoot } from "./helpers.mjs";
import { PRODUCT_NAME } from "../src/installer/providers.mjs";

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));

/**
 * Argument syntax pi actually substitutes: `$N`, `$@`, `$ARGUMENTS`,
 * `${@:N}`, `${@:N:L}`. Bash-style defaults (`${1:-status}`) are documented
 * on pi's main branch but are left verbatim in the expanded prompt by
 * released builds (verified against pi 0.76.0), which leaks template syntax
 * into the model's context.
 */
const SUPPORTED_TOKEN = /^\$\{@:\d+(?::\d+)?\}$/;
const TOKEN = /\$\{[^}]*\}/g;

describe("pi manifest", () => {
  it("declares the gallery keyword", () => {
    expect(pkg.keywords).toContain("pi-package");
  });

  it("declares only resource roots that exist and ship in the tarball", () => {
    const roots = Object.entries(pkg.pi).filter(([, value]) => Array.isArray(value));
    expect(roots.length).toBeGreaterThan(0);

    for (const [type, entries] of roots) {
      for (const entry of entries) {
        const abs = path.join(repoRoot, entry);
        expect(fs.existsSync(abs), `${type}: ${entry}`).toBe(true);
        const top = entry.replace(/^\.\//, "").split("/")[0];
        expect(pkg.files, `${type}: ${entry}`).toContain(top);
      }
    }
  });

  it("points each skills entry at a directory pi resolves to exactly one skill", () => {
    // Pi's rule: a directory holding SKILL.md is a skill root and is not
    // recursed into. Nesting one level deeper would load nothing.
    for (const entry of pkg.pi.skills) {
      const skillFile = path.join(repoRoot, entry, "SKILL.md");
      expect(fs.existsSync(skillFile), entry).toBe(true);

      const { frontmatter } = parseDocument(fs.readFileSync(skillFile, "utf8"));
      // Pi takes the name from frontmatter, not the parent directory, and
      // registers it as `/skill:<name>`.
      expect(frontmatter.name).toBe(PRODUCT_NAME);
      expect(String(frontmatter.description ?? "").length).toBeGreaterThan(0);
    }
  });
});

describe("pi prompt templates", () => {
  const dirs = pkg.pi.prompts.map((entry) => path.join(repoRoot, entry));
  const files = dirs.flatMap((dir) =>
    fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => path.join(dir, name)),
  );

  it("ships at least one template", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [path.basename(file), file]))("%s is loadable and fully substitutable", (_name, file) => {
    const source = fs.readFileSync(file, "utf8");
    const { frontmatter, error } = parseDocument(source);
    expect(error).toBeUndefined();
    expect(String(frontmatter.description ?? "").length).toBeGreaterThan(0);

    for (const token of source.match(TOKEN) ?? []) {
      expect(SUPPORTED_TOKEN.test(token), `unsupported template token ${token}`).toBe(true);
    }
  });
});
