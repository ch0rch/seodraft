#!/usr/bin/env node
/**
 * Framework + content-dir detection for `/seodraft init`.
 *
 *   node detect.mjs
 *
 * Prints `{ framework, contentDirCandidates, extension, sampleFrontmatterKeys }`.
 * `sampleFrontmatterKeys` maps each candidate dir to the union of frontmatter
 * keys found in up to 5 of its posts — that is what init shows the user to
 * confirm the frontmatter field mapping. No match: `{ "framework": "unknown",
 * "contentDirCandidates": [] }` and the skill asks the user instead.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "./lib/frontmatter.mjs";
import { output } from "./lib/config.mjs";

const SAMPLE_LIMIT = 5;

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

function firstGlob(root, patterns) {
  for (const pattern of patterns) {
    if (exists(root, pattern)) return pattern;
  }
  return null;
}

const DETECT_EXT_RE = /\.(md|mdx|mdoc)$/i;

/** List content files (.md/.mdx/.mdoc) directly under or nested in `dir`. */
function listContentFiles(root, dir, limit = Infinity) {
  const absDir = path.join(root, dir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) return [];
  const results = [];
  const stack = [absDir];
  while (stack.length > 0 && results.length < limit) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (results.length >= limit) break;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (DETECT_EXT_RE.test(entry.name)) results.push(full);
    }
  }
  return results;
}

/**
 * Directories (depth <= 3 below `base`) that DIRECTLY contain content
 * files. `content/blog/posts` beats `content` as a candidate because the
 * frontmatter samples then come from actual posts, not stray pages.
 */
function candidateDirsUnder(root, base, depth = 3) {
  const absBase = path.join(root, base);
  if (!fs.existsSync(absBase) || !fs.statSync(absBase).isDirectory()) return [];
  const found = [];
  const walk = (rel, remaining) => {
    const abs = path.join(root, rel);
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    if (entries.some((e) => e.isFile() && DETECT_EXT_RE.test(e.name))) found.push(rel);
    if (remaining === 0) return;
    for (const entry of entries) {
      if (entry.isDirectory()) walk(path.join(rel, entry.name), remaining - 1);
    }
  };
  walk(base, depth);
  return found;
}

/**
 * Explicit content-schema files, when the repo has one. These OUTRANK
 * sampled frontmatter: a field that is absent when it holds its default
 * (a Keystatic `fields.checkbox`, an optional Zod field) never appears in
 * any published post, so sampling alone maps it to `null` and the gate
 * then cannot enforce it. Verified against a Keystatic repo whose `draft`
 * checkbox was invisible in all 3 existing posts.
 */
const SCHEMA_FILES = [
  "keystatic.config.ts",
  "keystatic.config.tsx",
  "keystatic.config.js",
  "keystatic.config.mjs",
  "src/content/config.ts",
  "src/content/config.js",
  "src/content.config.ts",
  "src/content.config.js",
  "contentlayer.config.ts",
  "contentlayer.config.js",
];

function findSchemaFiles(root) {
  return SCHEMA_FILES.filter((rel) => exists(root, rel));
}

function detectFramework(root) {
  if (firstGlob(root, ["astro.config.mjs", "astro.config.ts", "astro.config.js", "astro.config.cjs"])) {
    const candidates = [];
    const contentRoot = path.join(root, "src/content");
    if (fs.existsSync(contentRoot)) {
      for (const entry of fs.readdirSync(contentRoot, { withFileTypes: true })) {
        if (entry.isDirectory() && listContentFiles(root, path.join("src/content", entry.name), 1).length > 0) {
          candidates.push(path.join("src/content", entry.name));
        }
      }
    }
    return { framework: "astro", candidates };
  }
  if (firstGlob(root, ["next.config.mjs", "next.config.ts", "next.config.js", "next.config.cjs"])) {
    const candidates = ["content", "posts", "src/content"].flatMap((base) => candidateDirsUnder(root, base));
    return { framework: "next", candidates };
  }
  if (exists(root, "hugo.toml") || (exists(root, "config.toml") && exists(root, "content"))) {
    const candidates = listContentFiles(root, "content", 1).length > 0 ? ["content"] : [];
    return { framework: "hugo", candidates };
  }
  if (exists(root, "_config.yml")) {
    const candidates = listContentFiles(root, "_posts", 1).length > 0 ? ["_posts"] : [];
    return { framework: "jekyll", candidates };
  }
  return { framework: "unknown", candidates: [] };
}

export function detect(root = process.cwd()) {
  const { framework, candidates } = detectFramework(root);
  const sampleFrontmatterKeys = {};
  const extensionCounts = new Map();

  for (const dir of candidates) {
    const keys = new Set();
    for (const file of listContentFiles(root, dir, SAMPLE_LIMIT)) {
      const ext = path.extname(file).toLowerCase();
      extensionCounts.set(ext, (extensionCounts.get(ext) ?? 0) + 1);
      const parsed = parseDocument(fs.readFileSync(file, "utf8"));
      if (parsed.frontmatter) {
        for (const key of Object.keys(parsed.frontmatter)) keys.add(key);
      }
    }
    sampleFrontmatterKeys[dir] = [...keys];
  }

  return {
    framework,
    contentDirCandidates: candidates,
    extension: [...extensionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ".md",
    schemaFiles: findSchemaFiles(root),
    sampleFrontmatterKeys,
  };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (isMain) {
  output(detect());
}
