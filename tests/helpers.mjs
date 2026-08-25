/** Shared test utilities: fixture path + temp-site builder. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const fixtureRoot = path.join(repoRoot, "fixtures", "astro-blog");

export const FIXTURE_CONFIG = JSON.parse(fs.readFileSync(path.join(fixtureRoot, ".seodraft", "config.json"), "utf8"));

/**
 * Create a throwaway site: `.seodraft/config.json` (fixture config merged
 * with `configOverrides`) plus `files` ({ relPath: content }). Returns the
 * root; caller cleans up via `fs.rmSync(root, { recursive: true })`.
 */
export function makeTempSite({ configOverrides = {}, files = {}, state = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "seodraft-test-"));
  fs.mkdirSync(path.join(root, ".seodraft"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".seodraft", "config.json"),
    JSON.stringify({ ...FIXTURE_CONFIG, ...configOverrides }, null, 2),
  );
  for (const [name, content] of Object.entries(state)) {
    fs.writeFileSync(path.join(root, ".seodraft", name), JSON.stringify(content, null, 2));
  }
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

/** Copy the whole fixture into a temp dir (for mutation tests). */
export function copyFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "seodraft-fixture-"));
  fs.cpSync(fixtureRoot, root, { recursive: true });
  return root;
}

/** Valid post body: 2 H2s, no H1, no placeholders. `links` are appended. */
export function validBody({ links = [], words = 60 } = {}) {
  const filler = Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
  return [
    "Intro paragraph before any heading.",
    "",
    "## First section",
    "",
    filler,
    "",
    "## Second section",
    "",
    "Closing prose paragraph.",
    ...links.map((href, i) => `[ref ${i}](${href})`),
    "",
  ].join("\n");
}

/** Valid frontmatter block for the fixture mapping. */
export function validFrontmatter(overrides = {}) {
  const fm = {
    title: "A Perfectly Reasonable Title Here",
    description: "A description that is comfortably long enough to satisfy the fifty character minimum rule.",
    pubDate: "2030-06-01",
    heroImage: "/images/x.png",
    tags: '["seo"]',
    draft: "false",
    ...overrides,
  };
  const lines = Object.entries(fm)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => (k === "tags" || k === "draft" || k === "pubDate" ? `${k}: ${v}` : `${k}: ${JSON.stringify(v)}`));
  return `---\n${lines.join("\n")}\n---\n`;
}
