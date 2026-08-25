#!/usr/bin/env node
/**
 * seodraft state validator.
 *
 *   node state.mjs validate
 *
 * Validates the `.seodraft/` state files against the v1 schemas and prints
 * `{ "ok": true }` or `{ "ok": false, "errors": [...] }` (exit 1 on invalid).
 * The skill's invariant (a): the agent edits state JSON directly and runs
 * this after every write.
 */
import path from "node:path";
import fs from "node:fs";
import { STATE_DIR, output } from "./lib/config.mjs";

const KEYWORD_TYPES = ["informational", "commercial", "transactional", "navigational"];
const KEYWORD_SOURCES = ["generate", "add", "chat", "estimate"];
const KEYWORD_STATUSES = ["stored", "planned", "written"];
const CALENDAR_STATUSES = ["scheduled", "writing", "done", "failed"];
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Canonical fields a config must map (value `null` = unused in this repo).
 *  `updatedDate`, `tldr` and `faqs` are the AEO trio: freshness signal,
 *  quotable answer block, and quotable Q&A pairs. */
const FRONTMATTER_FIELDS = ["title", "description", "date", "updatedDate", "image", "tags", "draft", "tldr", "faqs"];

function isString(value) {
  return typeof value === "string";
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}
function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function readStateFile(root, name, errors) {
  const filePath = path.join(root, STATE_DIR, name);
  if (!fs.existsSync(filePath)) return { exists: false, data: null };
  try {
    return { exists: true, data: JSON.parse(fs.readFileSync(filePath, "utf8")) };
  } catch (err) {
    errors.push(`${name}: invalid JSON (${err.message})`);
    return { exists: true, data: null };
  }
}

function validateConfig(config, errors) {
  const at = (msg) => errors.push(`config.json: ${msg}`);
  if (config.schemaVersion !== 1) at(`schemaVersion must be 1, got ${JSON.stringify(config.schemaVersion)}`);
  if (!isNonEmptyString(config.siteUrl) || !/^https?:\/\//.test(config.siteUrl)) at("siteUrl must be an http(s) URL");
  if (!isNonEmptyString(config.language)) at("language must be a non-empty string");
  if (!isNumber(config.locationCode)) at("locationCode must be a number");
  if (!isNonEmptyString(config.framework)) at("framework must be a non-empty string");
  if (!isNonEmptyString(config.contentDir)) at("contentDir must be a non-empty string");
  if (!isNonEmptyString(config.extension) || !config.extension.startsWith(".")) at('extension must start with "." (e.g. ".mdx")');
  if (typeof config.frontmatter !== "object" || config.frontmatter === null || Array.isArray(config.frontmatter)) {
    at("frontmatter must be an object mapping canonical field -> client key");
  } else {
    for (const field of FRONTMATTER_FIELDS) {
      if (!(field in config.frontmatter)) {
        at(`frontmatter.${field} is required (use null to mark the field unused)`);
      } else if (config.frontmatter[field] !== null && !isNonEmptyString(config.frontmatter[field])) {
        at(`frontmatter.${field} must be a non-empty string or null`);
      }
    }
    for (const key of Object.keys(config.frontmatter)) {
      if (!FRONTMATTER_FIELDS.includes(key)) at(`frontmatter.${key} is not a known canonical field`);
    }
  }
  if (typeof config.bodyH1 !== "boolean") at("bodyH1 must be a boolean");
  if (!isNumber(config.internalLinksMin) || config.internalLinksMin < 0) at("internalLinksMin must be a number >= 0");
  if (!isNumber(config.thinContentWords)) at("thinContentWords must be a number");
  if (!isNumber(config.titleMax)) at("titleMax must be a number");
  if (!isNumber(config.descriptionMax)) at("descriptionMax must be a number");
  for (const key of ["tldrMin", "tldrMax", "faqsMin", "faqAnswerMax"]) {
    if (!isNumber(config[key]) || config[key] < 0) at(`${key} must be a number >= 0`);
  }
  if (isNumber(config.tldrMin) && isNumber(config.tldrMax) && config.tldrMin > config.tldrMax) {
    at("tldrMin must not exceed tldrMax");
  }
}

function validateKeywords(doc, errors) {
  const at = (msg) => errors.push(`keywords.json: ${msg}`);
  if (doc.schemaVersion !== 1) at(`schemaVersion must be 1, got ${JSON.stringify(doc.schemaVersion)}`);
  if (!Array.isArray(doc.keywords)) {
    at("keywords must be an array");
    return;
  }
  const seen = new Set();
  doc.keywords.forEach((kw, i) => {
    const here = (msg) => at(`keywords[${i}]: ${msg}`);
    if (typeof kw !== "object" || kw === null) return here("must be an object");
    if (!isNonEmptyString(kw.term)) here("term must be a non-empty string");
    else {
      if (kw.term !== kw.term.toLowerCase().trim()) here(`term must be normalized lowercase, got ${JSON.stringify(kw.term)}`);
      if (seen.has(kw.term)) here(`duplicate term ${JSON.stringify(kw.term)}`);
      seen.add(kw.term);
    }
    if (!KEYWORD_SOURCES.includes(kw.source)) here(`source must be one of ${KEYWORD_SOURCES.join("|")}`);
    if (!KEYWORD_STATUSES.includes(kw.status)) here(`status must be one of ${KEYWORD_STATUSES.join("|")}`);
    if (!KEYWORD_TYPES.includes(kw.type)) here(`type must be one of ${KEYWORD_TYPES.join("|")}`);
    const allowNullMetrics = kw.source === "estimate";
    for (const metric of ["volume", "difficulty"]) {
      if (kw[metric] === null) {
        if (!allowNullMetrics) here(`${metric} may be null only when source is "estimate"`);
      } else if (!isNumber(kw[metric])) {
        here(`${metric} must be a number${allowNullMetrics ? " or null" : ""}`);
      }
    }
    if (!isString(kw.addedAt) || !ISO_8601_RE.test(kw.addedAt)) here("addedAt must be an ISO-8601 timestamp");
    if (kw.articlePath !== null && !isNonEmptyString(kw.articlePath)) here("articlePath must be a non-empty string or null");
    if (kw.status === "written" && kw.articlePath === null) here('status "written" requires a non-null articlePath');
  });
}

function validateCalendar(doc, errors) {
  const at = (msg) => errors.push(`calendar.json: ${msg}`);
  if (doc.schemaVersion !== 1) at(`schemaVersion must be 1, got ${JSON.stringify(doc.schemaVersion)}`);
  if (!Array.isArray(doc.entries)) {
    at("entries must be an array");
    return;
  }
  doc.entries.forEach((entry, i) => {
    const here = (msg) => at(`entries[${i}]: ${msg}`);
    if (typeof entry !== "object" || entry === null) return here("must be an object");
    if (!isNonEmptyString(entry.term)) here("term must be a non-empty string");
    if (!isString(entry.scheduledDate) || !DATE_RE.test(entry.scheduledDate)) here("scheduledDate must be YYYY-MM-DD");
    if (!isString(entry.customInstructions)) here("customInstructions must be a string");
    if (!CALENDAR_STATUSES.includes(entry.status)) here(`status must be one of ${CALENDAR_STATUSES.join("|")}`);
    if (entry.articlePath !== null && !isNonEmptyString(entry.articlePath)) here("articlePath must be a non-empty string or null");
    if (entry.failedReason !== null && !isNonEmptyString(entry.failedReason)) here("failedReason must be a non-empty string or null");
    if (entry.status === "done" && entry.articlePath === null) here('status "done" requires a non-null articlePath');
    if (entry.status === "failed" && entry.failedReason === null) here('status "failed" requires a non-null failedReason');
  });
}

function validateLocalConfig(doc, errors) {
  const at = (msg) => errors.push(`config.local.json: ${msg}`);
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return at("must be an object");
  if (doc.dataforseo !== undefined) {
    if (typeof doc.dataforseo !== "object" || doc.dataforseo === null) return at("dataforseo must be an object");
    if (!isNonEmptyString(doc.dataforseo.login)) at("dataforseo.login must be a non-empty string");
    if (!isNonEmptyString(doc.dataforseo.password)) at("dataforseo.password must be a non-empty string");
  }
}

export function validateState(root = process.cwd()) {
  const errors = [];

  const config = readStateFile(root, "config.json", errors);
  if (!config.exists) errors.push("config.json: missing — run /seodraft init first");
  else if (config.data !== null) validateConfig(config.data, errors);

  const keywords = readStateFile(root, "keywords.json", errors);
  if (keywords.exists && keywords.data !== null) validateKeywords(keywords.data, errors);

  const calendar = readStateFile(root, "calendar.json", errors);
  if (calendar.exists && calendar.data !== null) validateCalendar(calendar.data, errors);

  const local = readStateFile(root, "config.local.json", errors);
  if (local.exists && local.data !== null) validateLocalConfig(local.data, errors);

  // Cross-file: a written keyword's articlePath should match its calendar entry.
  if (keywords.data?.keywords && calendar.data?.entries) {
    const written = new Map(
      keywords.data.keywords.filter((kw) => kw.status === "written" && isNonEmptyString(kw.term)).map((kw) => [kw.term, kw]),
    );
    for (const entry of calendar.data.entries) {
      if (entry?.status === "done" && written.has(entry.term) && entry.articlePath !== written.get(entry.term).articlePath) {
        errors.push(`calendar.json: entry "${entry.term}" articlePath disagrees with keywords.json`);
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (isMain) {
  const command = process.argv[2];
  if (command !== "validate") {
    output({ ok: false, errors: [`unknown command ${JSON.stringify(command ?? "")} — usage: node state.mjs validate`] }, 1);
  }
  const result = validateState();
  output(result, result.ok ? 0 : 1);
}
