/**
 * Shared loader for `.seodraft/` state files. Every script runs with
 * cwd = client repo root; state lives in `.seodraft/` beside it.
 */
import fs from "node:fs";
import path from "node:path";

export const STATE_DIR = ".seodraft";

export const CONFIG_DEFAULTS = {
  bodyH1: false,
  internalLinksMin: 2,
  thinContentWords: 500,
  titleMax: 60,
  descriptionMax: 160,
  // AEO: a TL;DR shorter than this is a teaser, not an answer; longer than
  // this stops being quotable as a self-contained block.
  tldrMin: 100,
  tldrMax: 400,
  // Quotable Q&A pairs are what answer engines lift verbatim.
  faqsMin: 3,
  faqAnswerMax: 500,
};

/** Read + parse a JSON file. Returns `null` when missing, throws on bad JSON. */
export function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/**
 * Regex matching the content extensions to scan: always `.md`/`.mdx`, plus
 * the configured `extension` (e.g. `.mdoc` for Keystatic/Markdoc repos).
 */
export function contentExtensionRegex(config) {
  const exts = new Set(["md", "mdx"]);
  const configured = config?.extension?.replace(/^\./, "");
  if (configured) exts.add(configured.toLowerCase());
  return new RegExp(`\\.(${[...exts].join("|")})$`, "i");
}

/**
 * Load `.seodraft/config.json` from `root`, merged over defaults.
 * Returns `null` when the file does not exist.
 */
export function loadConfig(root = process.cwd()) {
  const config = readJson(path.join(root, STATE_DIR, "config.json"));
  if (config === null) return null;
  return { ...CONFIG_DEFAULTS, ...config };
}

/** Load `.seodraft/config.local.json` (gitignored secrets). `null` if absent. */
export function loadLocalConfig(root = process.cwd()) {
  return readJson(path.join(root, STATE_DIR, "config.local.json"));
}

/** Print a JSON result and exit. */
export function output(result, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(exitCode);
}
