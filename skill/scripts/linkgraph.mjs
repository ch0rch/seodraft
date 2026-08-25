#!/usr/bin/env node
/**
 * Deterministic internal-link substrate.
 *
 *   node linkgraph.mjs inventory
 *
 * Scans `contentDir` (from `.seodraft/config.json`) recursively for .md/.mdx
 * and prints `{ posts: [...] }`, one entry per post:
 * path, slug, title, description, headings, outboundInternal (resolved
 * slugs), brokenInternal (hrefs that resolve to no post), wordCount.
 *
 * An internal link is any href that is not absolute-with-scheme, not
 * protocol-relative, and not a bare anchor. It resolves when its last path
 * segment matches a known post slug (`/blog/my-post/` -> `my-post`).
 * This is the substrate for internal-link suggestions, cannibalization
 * checks, and orphan detection — gate and audit both build on it.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocument, getMappedValue } from "./lib/frontmatter.mjs";
import { scanMarkdown, isInternalUrl, normalizeInternalHref } from "./lib/markdown.mjs";
import { loadConfig, contentExtensionRegex, output } from "./lib/config.mjs";

export function listContentFiles(absDir, extRe = /\.mdx?$/i) {
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) return [];
  const results = [];
  const stack = [absDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (extRe.test(entry.name)) results.push(full);
    }
  }
  return results.sort();
}

/** Slug = file basename without extension (Astro/Next/Hugo/Keystatic convention). */
export function slugForFile(filePath, extRe = /\.mdx?$/i) {
  return path.basename(filePath).replace(extRe, "");
}

/**
 * Build the inventory for `root` (client repo root). Requires config.json;
 * returns `{ error }` when it is missing so callers can report, not crash.
 */
export function buildInventory(root = process.cwd()) {
  const config = loadConfig(root);
  if (config === null) return { error: "missing-config", message: ".seodraft/config.json not found — run /seodraft init first" };

  const extRe = contentExtensionRegex(config);
  const absContentDir = path.join(root, config.contentDir);
  const files = listContentFiles(absContentDir, extRe);
  const fm = config.frontmatter ?? {};

  // First pass: parse every post so link resolution sees the full slug set.
  const parsed = files.map((file) => {
    const source = fs.readFileSync(file, "utf8");
    const doc = parseDocument(source);
    return { file, doc };
  });
  const slugs = new Set(parsed.map(({ file }) => slugForFile(file, extRe)));

  const posts = parsed.map(({ file, doc }) => {
    const relPath = path.relative(root, file);
    const slug = slugForFile(file, extRe);
    const frontmatter = doc.frontmatter ?? {};
    const scan = scanMarkdown(doc.body ?? "");

    const outboundInternal = [];
    const brokenInternal = [];
    for (const link of scan.links) {
      if (!isInternalUrl(link.url)) continue;
      const target = normalizeInternalHref(link.url);
      if (target === "") continue; // link to site root
      const targetSlug = target.split("/").pop();
      if (slugs.has(targetSlug) && targetSlug !== slug) {
        outboundInternal.push(targetSlug);
      } else if (!slugs.has(targetSlug)) {
        brokenInternal.push(link.url);
      }
    }

    return {
      path: relPath,
      slug,
      title: fm.title ? (getMappedValue(frontmatter, fm.title) ?? null) : null,
      description: fm.description ? (getMappedValue(frontmatter, fm.description) ?? null) : null,
      frontmatterError: doc.error ?? null,
      headings: scan.headings.map((h) => ({ level: h.level, text: h.text })),
      outboundInternal,
      brokenInternal,
      wordCount: scan.wordCount,
    };
  });

  return { posts };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (isMain) {
  const command = process.argv[2];
  if (command !== "inventory") {
    output({ error: "unknown-command", message: `usage: node linkgraph.mjs inventory` }, 1);
  }
  const result = buildInventory();
  output(result, result.error ? 1 : 0);
}
