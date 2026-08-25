#!/usr/bin/env node
/**
 * Deterministic content audit — findings are the product, so this always
 * exits 0 (contrast with gate.mjs, which blocks).
 *
 *   node audit.mjs [--file <path>]
 *
 * Prints `{ ok, failures, advisories }` with items
 * `{ rule, file, message, severity }`. `--file` filters the report to one
 * post; cross-post rules (duplicate-*, orphan-page) are still computed over
 * the whole content dir so the filtered view stays truthful.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocument, getMappedValue, normalizeFaqs } from "./lib/frontmatter.mjs";
import { scanMarkdown } from "./lib/markdown.mjs";
import { loadConfig, output } from "./lib/config.mjs";
import { buildInventory } from "./linkgraph.mjs";

const STALE_MONTHS = 12;

export function runAudit(root = process.cwd(), onlyFile = null) {
  const failures = [];
  const advisories = [];

  const config = loadConfig(root);
  if (config === null) {
    failures.push({ rule: "missing-config", file: null, message: ".seodraft/config.json not found — run /seodraft init first", severity: "error" });
    return { ok: false, failures, advisories };
  }
  const inventory = buildInventory(root);
  const posts = inventory.posts ?? [];
  const fm = config.frontmatter ?? {};

  const add = (severity, rule, file, message) => {
    (severity === "error" ? failures : advisories).push({ rule, file, message, severity });
  };

  // Inbound counts for orphan detection.
  const inbound = new Map(posts.map((post) => [post.slug, 0]));
  for (const post of posts) {
    for (const target of post.outboundInternal) {
      inbound.set(target, (inbound.get(target) ?? 0) + 1);
    }
  }

  // Duplicate title/description across posts.
  const byTitle = new Map();
  const byDescription = new Map();
  for (const post of posts) {
    if (typeof post.title === "string" && post.title.trim() !== "") {
      const key = post.title.trim().toLowerCase();
      byTitle.set(key, [...(byTitle.get(key) ?? []), post]);
    }
    if (typeof post.description === "string" && post.description.trim() !== "") {
      const key = post.description.trim().toLowerCase();
      byDescription.set(key, [...(byDescription.get(key) ?? []), post]);
    }
  }

  const staleCutoff = new Date();
  staleCutoff.setMonth(staleCutoff.getMonth() - STALE_MONTHS);

  for (const post of posts) {
    const file = post.path;

    if (post.frontmatterError) {
      add("error", "frontmatter-parse", file, "frontmatter is unparseable (beyond the supported YAML subset)");
      continue;
    }

    // missing-title / missing-description (only when the field is mapped).
    if (fm.title && (post.title === null || post.title === undefined || String(post.title).trim() === "")) {
      add("error", "missing-title", file, `mapped title field (${fm.title}) is missing or empty`);
    }
    if (fm.description && (post.description === null || post.description === undefined || String(post.description).trim() === "")) {
      add("error", "missing-description", file, `mapped description field (${fm.description}) is missing or empty`);
    }

    // title-length / description-length
    if (typeof post.title === "string" && post.title.trim() !== "") {
      if (post.title.length > config.titleMax) add("error", "title-length", file, `title is ${post.title.length} chars (max ${config.titleMax})`);
      if (post.title.length < 15) add("error", "title-length", file, `title is ${post.title.length} chars (min 15)`);
      const twins = byTitle.get(post.title.trim().toLowerCase()) ?? [];
      if (twins.length > 1) {
        const others = twins.filter((p) => p.path !== file).map((p) => p.path);
        add("error", "duplicate-title", file, `title duplicated in: ${others.join(", ")}`);
      }
    }
    if (typeof post.description === "string" && post.description.trim() !== "") {
      if (post.description.length > config.descriptionMax) add("error", "description-length", file, `description is ${post.description.length} chars (max ${config.descriptionMax})`);
      if (post.description.length < 50) add("error", "description-length", file, `description is ${post.description.length} chars (min 50)`);
      const twins = byDescription.get(post.description.trim().toLowerCase()) ?? [];
      if (twins.length > 1) {
        const others = twins.filter((p) => p.path !== file).map((p) => p.path);
        add("error", "duplicate-description", file, `description duplicated in: ${others.join(", ")}`);
      }
    }

    // broken-internal-link (from the linkgraph).
    for (const href of post.brokenInternal) {
      add("error", "broken-internal-link", file, `internal link "${href}" resolves to no existing post`);
    }

    // orphan-page: nothing links here.
    if ((inbound.get(post.slug) ?? 0) === 0) {
      add("advisory", "orphan-page", file, "no other post links to this one");
    }

    // heading-skip
    for (let i = 1; i < post.headings.length; i++) {
      const prev = post.headings[i - 1];
      const next = post.headings[i];
      if (next.level > prev.level + 1) {
        add("error", "heading-skip", file, `heading level skip: H${prev.level} ("${prev.text}") -> H${next.level} ("${next.text}")`);
      }
    }

    // thin-content
    if (post.wordCount < config.thinContentWords) {
      add("advisory", "thin-content", file, `body has ${post.wordCount} words (threshold ${config.thinContentWords})`);
    }

    // missing-alt-text and stale-post need the raw document.
    const source = fs.readFileSync(path.join(root, file), "utf8");
    const doc = parseDocument(source);
    const scan = scanMarkdown(doc.body ?? "");
    for (const image of scan.images) {
      if (image.alt.trim() === "") {
        add("error", "missing-alt-text", file, `image "${image.url}" (line ${image.line}) has empty alt text`);
      }
    }
    // stale-post prefers `updatedDate` when mapped: a post that HAS been
    // refreshed is not stale, and the published date can never say so. This
    // is the same value the site feeds to `dateModified` in its JSON-LD.
    const freshnessField = fm.updatedDate && getMappedValue(doc.frontmatter, fm.updatedDate) ? fm.updatedDate : fm.date;
    if (freshnessField && doc.frontmatter) {
      const raw = getMappedValue(doc.frontmatter, freshnessField);
      const date = typeof raw === "string" || typeof raw === "number" ? new Date(raw) : null;
      if (date && !Number.isNaN(date.getTime()) && date < staleCutoff) {
        add("advisory", "stale-post", file, `last-updated date ${raw} is older than ${STALE_MONTHS} months`);
      }
    }

    // A mapped-but-absent `updatedDate` is invisible to the gate on existing
    // content, yet it is the reason a refreshed post cannot signal freshness:
    // the site's `dateModified` silently falls back to the published date.
    if (fm.updatedDate && doc.frontmatter && !getMappedValue(doc.frontmatter, fm.updatedDate)) {
      add(
        "advisory",
        "missing-updated-date",
        file,
        `mapped updatedDate field (${fm.updatedDate}) is absent — dateModified falls back to the published date, so a refresh can never register`,
      );
    }

    // AEO gaps. Advisory on purpose: a legacy archive that predates the AEO
    // standard is an opportunity list, not a defect list. The gate errors on
    // the same rules so new content cannot regress.
    if (fm.tldr && doc.frontmatter) {
      const tldr = getMappedValue(doc.frontmatter, fm.tldr);
      if (typeof tldr !== "string" || tldr.trim() === "") {
        add("advisory", "missing-tldr", file, `mapped tldr field (${fm.tldr}) is missing or empty — answer engines have no block to quote`);
      } else if (tldr.length > config.tldrMax) {
        add("advisory", "tldr-length", file, `tldr is ${tldr.length} chars (max ${config.tldrMax})`);
      } else if (tldr.length < config.tldrMin) {
        add("advisory", "tldr-length", file, `tldr is ${tldr.length} chars (min ${config.tldrMin})`);
      }
    }
    if (fm.faqs && doc.frontmatter) {
      const faqs = normalizeFaqs(getMappedValue(doc.frontmatter, fm.faqs));
      if (faqs.length === 0) {
        add("advisory", "missing-faqs", file, `mapped faqs field (${fm.faqs}) is missing or empty — no quotable Q&A pairs`);
      } else if (faqs.length < config.faqsMin) {
        add("advisory", "missing-faqs", file, `${faqs.length} FAQ item(s), below the ${config.faqsMin} this site targets`);
      }
      faqs.forEach((faq, i) => {
        if (typeof faq.answer === "string" && faq.answer.length > config.faqAnswerMax) {
          add("advisory", "faq-answer-length", file, `FAQ ${i + 1} answer is ${faq.answer.length} chars (max ${config.faqAnswerMax})`);
        }
      });
    }
  }

  let filteredFailures = failures;
  let filteredAdvisories = advisories;
  if (onlyFile) {
    const rel = path.relative(root, path.resolve(root, onlyFile));
    filteredFailures = failures.filter((item) => item.file === rel);
    filteredAdvisories = advisories.filter((item) => item.file === rel);
  }
  return { ok: filteredFailures.length === 0, failures: filteredFailures, advisories: filteredAdvisories };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (isMain) {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf("--file");
  const onlyFile = fileIndex !== -1 ? args[fileIndex + 1] : null;
  output(runAudit(process.cwd(), onlyFile), 0);
}
