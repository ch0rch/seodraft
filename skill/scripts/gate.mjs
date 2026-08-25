#!/usr/bin/env node
/**
 * Pre-publish gate (blogEO-style): the agent proposes, this code decides.
 *
 *   node gate.mjs <file> [--term "<target keyword>"]
 *
 * Prints `{ ok, failures, advisories }` with items
 * `{ rule, file, message, severity }` and exits 1 on any error-severity
 * failure. The skill never finishes an article that fails this gate; after
 * 2 redrafts it stops and marks the calendar entry failed.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocument, getMappedValue, normalizeFaqs } from "./lib/frontmatter.mjs";
import { scanMarkdown, isInternalUrl, normalizeInternalHref } from "./lib/markdown.mjs";
import { loadConfig, contentExtensionRegex, readJson, output, STATE_DIR } from "./lib/config.mjs";
import { buildInventory, slugForFile } from "./linkgraph.mjs";

const PLACEHOLDER_PATTERNS = [
  { pattern: /\bTODO\b/, label: "TODO" },
  { pattern: /lorem ipsum/i, label: "lorem ipsum" },
  { pattern: /as an ai/i, label: "As an AI" },
  { pattern: /\[insert/i, label: "[insert" },
];

/** Token-set Jaccard similarity between two titles. */
export function titleJaccard(a, b) {
  const tokens = (s) => new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const setA = tokens(a);
  const setB = tokens(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

export function runGate(root, fileArg, term) {
  const failures = [];
  const advisories = [];
  const relFile = path.relative(root, path.resolve(root, fileArg));
  const fail = (rule, message) => failures.push({ rule, file: relFile, message, severity: "error" });
  const advise = (rule, message) => advisories.push({ rule, file: relFile, message, severity: "advisory" });

  const config = loadConfig(root);
  if (config === null) {
    fail("frontmatter-parse", ".seodraft/config.json not found — run /seodraft init first");
    return { ok: false, failures, advisories };
  }
  const absFile = path.resolve(root, fileArg);
  if (!fs.existsSync(absFile)) {
    fail("frontmatter-parse", `file not found: ${relFile}`);
    return { ok: false, failures, advisories };
  }

  const doc = parseDocument(fs.readFileSync(absFile, "utf8"));
  const fm = config.frontmatter ?? {};

  // frontmatter-parse
  if (doc.error) {
    fail("frontmatter-parse", "frontmatter is unparseable (beyond the supported YAML subset)");
  } else if (doc.frontmatter === null) {
    fail("frontmatter-parse", "no frontmatter block found");
  }
  const frontmatter = doc.frontmatter ?? {};

  // frontmatter-complete: every non-null mapped CONTENT field present and
  // non-empty. `draft` is exempt on purpose: it is a publication-state flag,
  // not content, and an absent flag legitimately means "published" (a
  // Keystatic `fields.checkbox` is omitted whenever it is false). Requiring
  // it would fail every already-published post while adding no SEO value.
  // The write pipeline still sets `draft: true` on new articles.
  if (!doc.error && doc.frontmatter !== null) {
    for (const [canonical, key] of Object.entries(fm)) {
      if (key === null || canonical === "draft") continue;
      const value = getMappedValue(frontmatter, key);
      const empty =
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "") ||
        (Array.isArray(value) && value.length === 0);
      if (empty) fail("frontmatter-complete", `mapped field "${canonical}" (${key}) is missing or empty`);
    }
  }

  // title-length / description-length
  const title = fm.title ? getMappedValue(frontmatter, fm.title) : null;
  if (typeof title === "string" && title.trim() !== "") {
    if (title.length > config.titleMax) fail("title-length", `title is ${title.length} chars (max ${config.titleMax})`);
    if (title.length < 15) fail("title-length", `title is ${title.length} chars (min 15)`);
  }
  const description = fm.description ? getMappedValue(frontmatter, fm.description) : null;
  if (typeof description === "string" && description.trim() !== "") {
    if (description.length > config.descriptionMax) fail("description-length", `description is ${description.length} chars (max ${config.descriptionMax})`);
    if (description.length < 50) fail("description-length", `description is ${description.length} chars (min 50)`);
  }

  // AEO rules. These error in the GATE because new content must meet the
  // standard; the same findings stay advisory in the AUDIT, where erroring a
  // legacy archive that predates the standard is noise, not signal.
  // A mapped-but-empty tldr/faqs is already caught by frontmatter-complete.
  const tldr = fm.tldr ? getMappedValue(frontmatter, fm.tldr) : null;
  if (typeof tldr === "string" && tldr.trim() !== "") {
    if (tldr.length > config.tldrMax) fail("tldr-length", `tldr is ${tldr.length} chars (max ${config.tldrMax})`);
    if (tldr.length < config.tldrMin) fail("tldr-length", `tldr is ${tldr.length} chars (min ${config.tldrMin}) — a teaser, not a self-contained answer`);
  }
  if (fm.faqs) {
    const faqs = normalizeFaqs(getMappedValue(frontmatter, fm.faqs));
    if (faqs.length > 0 && faqs.length < config.faqsMin) {
      fail("faqs-min", `${faqs.length} FAQ item(s), need at least ${config.faqsMin}`);
    }
    faqs.forEach((faq, i) => {
      if (typeof faq.answer === "string" && faq.answer.length > config.faqAnswerMax) {
        advise("faq-answer-length", `FAQ ${i + 1} answer is ${faq.answer.length} chars (max ${config.faqAnswerMax}) — too long to be quoted whole`);
      }
    });
  }

  const scan = scanMarkdown(doc.body ?? "");

  // h1-policy
  const h1Count = scan.headings.filter((h) => h.level === 1).length;
  const expectedH1 = config.bodyH1 ? 1 : 0;
  if (h1Count !== expectedH1) {
    fail("h1-policy", `body has ${h1Count} H1(s), expected ${expectedH1} (bodyH1: ${config.bodyH1})`);
  }

  // heading-structure
  const h2Count = scan.headings.filter((h) => h.level === 2).length;
  if (h2Count < 2) fail("heading-structure", `body has ${h2Count} H2(s), need at least 2`);
  for (let i = 1; i < scan.headings.length; i++) {
    const prev = scan.headings[i - 1];
    const next = scan.headings[i];
    if (next.level > prev.level + 1) {
      fail("heading-structure", `heading level skip: H${prev.level} ("${prev.text}") -> H${next.level} ("${next.text}")`);
    }
  }

  // internal links, resolved against the linkgraph slug set.
  const inventory = buildInventory(root);
  const posts = inventory.posts ?? [];
  const ownSlug = slugForFile(absFile, contentExtensionRegex(config));
  const slugs = new Set(posts.map((post) => post.slug));
  slugs.add(ownSlug);

  let resolvedInternal = 0;
  for (const link of scan.links) {
    if (!isInternalUrl(link.url)) continue;
    const target = normalizeInternalHref(link.url);
    if (target === "") continue;
    const targetSlug = target.split("/").pop();
    if (slugs.has(targetSlug) && targetSlug !== ownSlug) {
      resolvedInternal++;
    } else if (!slugs.has(targetSlug)) {
      fail("broken-internal-link", `internal link "${link.url}" resolves to no existing post`);
    }
  }
  if (resolvedInternal < config.internalLinksMin) {
    fail("internal-links-min", `${resolvedInternal} resolving internal link(s), need at least ${config.internalLinksMin}`);
  }

  // cannibalization: hard stop, never rephrase around it.
  if (term) {
    const normalizedTerm = term.toLowerCase().trim();
    const keywordsDoc = readJson(path.join(root, STATE_DIR, "keywords.json"));
    for (const kw of keywordsDoc?.keywords ?? []) {
      if (kw.term === normalizedTerm && kw.articlePath !== null && path.resolve(root, kw.articlePath) !== absFile) {
        fail("cannibalization", `term "${normalizedTerm}" is already covered by ${kw.articlePath} — edit that post instead`);
      }
    }
  }

  // cannibalization-fuzzy: near-duplicate titles split your own ranking.
  if (typeof title === "string" && title.trim() !== "") {
    for (const post of posts) {
      if (post.slug === ownSlug || typeof post.title !== "string") continue;
      const similarity = titleJaccard(title, post.title);
      if (similarity >= 0.6) {
        advise("cannibalization-fuzzy", `title is ${(similarity * 100).toFixed(0)}% similar to "${post.title}" (${post.path})`);
      }
    }
  }

  // placeholder-text
  for (const { pattern, label } of PLACEHOLDER_PATTERNS) {
    if (pattern.test(doc.body ?? "")) fail("placeholder-text", `body contains placeholder text: ${JSON.stringify(label)}`);
  }

  // thin-content
  if (scan.wordCount < config.thinContentWords) {
    advise("thin-content", `body has ${scan.wordCount} words (threshold ${config.thinContentWords})`);
  }

  return { ok: failures.length === 0, failures, advisories };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (isMain) {
  const args = process.argv.slice(2);
  const termIndex = args.indexOf("--term");
  const term = termIndex !== -1 ? args[termIndex + 1] : null;
  const file = args.filter((arg, i) => arg !== "--term" && i !== termIndex + 1)[0];
  if (!file) {
    output({ ok: false, failures: [{ rule: "usage", file: null, message: 'usage: node gate.mjs <file> [--term "<term>"]', severity: "error" }], advisories: [] }, 1);
  }
  const result = runGate(process.cwd(), file, term);
  output(result, result.ok ? 0 : 1);
}
