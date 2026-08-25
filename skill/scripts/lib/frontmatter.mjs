/**
 * Hand-rolled frontmatter parser/serializer — no YAML dependency.
 *
 * PARSING covers the shapes real content repos use (verified against
 * Astro, Next+Keystatic/.mdoc, Hugo, Jekyll posts):
 *   - scalars: plain, quoted, numbers, booleans, null, ISO dates (as strings)
 *   - block scalars: `|`, `>`, with `-`/`+` chomping (folded/literal)
 *   - nested maps by indentation (any depth)
 *   - sequences of scalars and sequences of maps (`faqs:`-style)
 *   - inline flat arrays `[a, "b, c"]`
 *
 * Anything genuinely beyond that (anchors/aliases/tags, flow maps `{}`,
 * tab indentation) makes `parseDocument` return
 * `{ error: "unparseable-frontmatter" }` — consumers report it as a
 * finding, never crash.
 *
 * SERIALIZATION stays the flat v1 subset (string, number, boolean, ISO
 * date, flat string array): scripts never write posts — the agent does —
 * so the serializer only needs to cover what seodraft itself emits.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const KEY_RE = /^([A-Za-z0-9_.-]+):(.*)$/;

class Unparseable extends Error {}

/** Parse one scalar token into string | number | boolean | null. */
function parseScalar(raw) {
  const value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    const inner = value.slice(1, -1);
    return value[0] === '"' ? inner.replace(/\\"/g, '"') : inner.replace(/''/g, "'");
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (ISO_DATE_RE.test(value)) return value; // dates stay strings
  if (value !== "" && !Number.isNaN(Number(value))) return Number(value);
  if (value.startsWith("&") || value.startsWith("*") || value.startsWith("!") || value.startsWith("{")) {
    throw new Unparseable(`unsupported YAML feature: ${value[0]}`);
  }
  return value;
}

/** Split an inline flat array body (`a, "b, c", d`) into scalar items. */
function parseInlineArray(body) {
  const items = [];
  let current = "";
  let quote = null;
  for (const ch of body) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ",") {
      items.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "" || items.length > 0) items.push(current);
  if (quote) throw new Unparseable("unterminated quote in inline array");
  return items.map((item) => parseScalar(item));
}

/** Indent = count of leading spaces. Tabs are beyond the subset. */
function indentOf(line) {
  const match = line.match(/^( *)/);
  if (/^\s*\t/.test(line)) throw new Unparseable("tab indentation");
  return match[1].length;
}

function isBlank(line) {
  return line.trim() === "" || line.trim().startsWith("#");
}

/** Next non-blank line index at or after `i`, or -1. */
function nextContent(lines, i) {
  for (let j = i; j < lines.length; j++) {
    if (!isBlank(lines[j])) return j;
  }
  return -1;
}

/**
 * Collect a block scalar (`|`/`>` already seen in `header`) whose content
 * lines are indented deeper than `keyIndent`. Returns [value, nextIndex].
 */
function parseBlockScalar(lines, i, keyIndent, header) {
  const folded = header[0] === ">";
  const chomp = header[1] === "-" ? "strip" : header[1] === "+" ? "keep" : "clip";
  const raw = [];
  let contentIndent = null;
  let j = i;
  for (; j < lines.length; j++) {
    const line = lines[j];
    if (line.trim() === "") {
      raw.push("");
      continue;
    }
    const ind = indentOf(line);
    if (ind <= keyIndent) break;
    if (contentIndent === null) contentIndent = ind;
    raw.push(line.slice(Math.min(contentIndent, ind)));
  }
  // Drop trailing blank lines into the chomp decision.
  while (raw.length > 0 && raw[raw.length - 1] === "") raw.pop();

  let value;
  if (folded) {
    // Folded: newlines become spaces; blank lines become one newline.
    value = raw
      .join("\n")
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.replace(/\n/g, " "))
      .join("\n");
  } else {
    value = raw.join("\n");
  }
  if (chomp !== "strip" && raw.length > 0) value += "\n";
  return [value, j];
}

/** Parse a map whose keys sit at exactly `indent`. Returns [obj, nextIndex]. */
function parseMap(lines, i, indent) {
  const data = {};
  let j = i;
  while (j < lines.length) {
    if (isBlank(lines[j])) {
      j++;
      continue;
    }
    const ind = indentOf(lines[j]);
    if (ind !== indent) break;
    const line = lines[j].slice(ind);
    if (line.startsWith("- ") || line === "-") throw new Unparseable("sequence item where a map key was expected");
    const kv = line.match(KEY_RE);
    if (!kv) throw new Unparseable(`not a key/value line: ${JSON.stringify(line)}`);
    const [value, next] = parseValue(lines, j + 1, ind, kv[2].trim());
    data[kv[1]] = value;
    j = next;
  }
  return [data, j];
}

/** Parse a sequence whose `-` markers sit at exactly `indent`. */
function parseSequence(lines, i, indent) {
  const items = [];
  let j = i;
  while (j < lines.length) {
    if (isBlank(lines[j])) {
      j++;
      continue;
    }
    const ind = indentOf(lines[j]);
    if (ind !== indent) break;
    const line = lines[j].slice(ind);
    if (!line.startsWith("-")) break;
    const rest = line.slice(1);
    if (rest !== "" && !rest.startsWith(" ")) throw new Unparseable(`not a sequence item: ${JSON.stringify(line)}`);
    const restTrim = rest.trim();

    if (restTrim === "") {
      // Nested structure on the following deeper-indented lines.
      const next = nextContent(lines, j + 1);
      if (next === -1 || indentOf(lines[next]) <= indent) {
        items.push(null);
        j++;
        continue;
      }
      const childIndent = indentOf(lines[next]);
      const [value, after] = lines[next].slice(childIndent).startsWith("- ")
        ? parseSequence(lines, next, childIndent)
        : parseMap(lines, next, childIndent);
      items.push(value);
      j = after;
      continue;
    }

    const itemIndent = ind + (line.length - line.replace(/^-\s+/, "").length);
    const kv = restTrim.match(KEY_RE);
    if (kv && (kv[2] === "" || kv[2].startsWith(" "))) {
      // Map item: first key inline after `- `, siblings below at itemIndent.
      // Rewrite the marker line as a plain key line and reparse as a map.
      const patched = lines.slice();
      patched[j] = " ".repeat(itemIndent) + restTrim;
      const [value, after] = parseMap(patched, j, itemIndent);
      items.push(value);
      j = after;
    } else if (restTrim.startsWith("|") || restTrim.startsWith(">")) {
      const [value, after] = parseBlockScalar(lines, j + 1, ind, restTrim);
      items.push(value);
      j = after;
    } else {
      items.push(parseScalar(restTrim));
      j++;
    }
  }
  return [items, j];
}

/**
 * Parse the value that follows `key:` at `keyIndent`. `rest` is the text
 * after the colon, already trimmed. Returns [value, nextIndex].
 */
function parseValue(lines, i, keyIndent, rest) {
  if (rest !== "") {
    if (rest.startsWith("|") || rest.startsWith(">")) return parseBlockScalar(lines, i, keyIndent, rest);
    if (rest.startsWith("[")) {
      if (!rest.endsWith("]")) throw new Unparseable("unterminated inline array");
      return [rest === "[]" ? [] : parseInlineArray(rest.slice(1, -1)), i];
    }
    return [parseScalar(rest), i];
  }
  // Empty rest: nested map, sequence, or empty value — decided by lookahead.
  const next = nextContent(lines, i);
  if (next === -1) return ["", i];
  const ind = indentOf(lines[next]);
  if (ind > keyIndent) {
    const child = lines[next].slice(ind);
    return child.startsWith("- ") || child === "-" ? parseSequence(lines, next, ind) : parseMap(lines, next, ind);
  }
  // A sequence may sit at the SAME indent as its key (common YAML style).
  if (ind === keyIndent && (lines[next].slice(ind).startsWith("- ") || lines[next].slice(ind) === "-")) {
    return parseSequence(lines, next, ind);
  }
  return ["", i];
}

/**
 * Parse a frontmatter block body (the lines between the `---` fences).
 * Returns `{ data }` or `{ error: "unparseable-frontmatter" }`.
 */
export function parseFrontmatterBlock(block) {
  try {
    const lines = block.split(/\r?\n/);
    const first = nextContent(lines, 0);
    if (first === -1) return { data: {} };
    if (indentOf(lines[first]) !== 0) throw new Unparseable("top level must not be indented");
    const [data, after] = parseMap(lines, first, 0);
    const trailing = nextContent(lines, after);
    if (trailing !== -1) throw new Unparseable(`unparsed content at line ${trailing + 1}`);
    return { data };
  } catch (err) {
    if (err instanceof Unparseable) return { error: "unparseable-frontmatter" };
    throw err;
  }
}

/**
 * Parse a whole Markdown/MDX/Markdoc document. Returns:
 * - `{ frontmatter: null, body }` when there is no frontmatter fence.
 * - `{ frontmatter: {...}, body }` on success.
 * - `{ error: "unparseable-frontmatter", body }` when the block exists but
 *   is beyond the subset (or the closing fence is missing).
 */
export function parseDocument(source) {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) {
    return { frontmatter: null, body: source };
  }
  const rest = source.slice(source.indexOf("\n") + 1);
  const closeMatch = rest.match(/^---\s*$/m);
  if (!closeMatch) return { error: "unparseable-frontmatter", body: source };
  const block = rest.slice(0, closeMatch.index);
  const body = rest.slice(closeMatch.index + closeMatch[0].length).replace(/^\r?\n/, "");
  const parsed = parseFrontmatterBlock(block);
  if (parsed.error) return { error: parsed.error, body };
  return { frontmatter: parsed.data, body };
}

/**
 * Resolve a frontmatter mapping path against parsed frontmatter.
 * Paths are dot-separated (`"seo.seoTitle"`); a plain key is the common
 * case. Returns `undefined` when any segment is missing.
 */
export function getMappedValue(frontmatter, mappedPath) {
  if (frontmatter === null || frontmatter === undefined || !mappedPath) return undefined;
  // Exact key wins so literal dotted keys keep working.
  if (Object.prototype.hasOwnProperty.call(frontmatter, mappedPath)) return frontmatter[mappedPath];
  let current = frontmatter;
  for (const segment of mappedPath.split(".")) {
    if (current === null || typeof current !== "object" || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

/** Serialize one scalar for YAML output. */
function serializeScalar(value) {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (value === null) return "null";
  const str = String(value);
  if (ISO_DATE_RE.test(str)) return str; // dates stay bare for Astro's z.date()
  if (str === "" || /[:#\[\]{}"'\n,&*?|>%@`-]|^\s|\s$/.test(str) || /^(true|false|null|~)$/.test(str) || (!Number.isNaN(Number(str)) && str.trim() !== "")) {
    return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return str;
}

/** Serialize a flat object into a frontmatter block body (no fences). */
export function serializeFrontmatterBlock(data) {
  const lines = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((item) => serializeScalar(item)).join(", ")}]`);
    } else {
      lines.push(`${key}: ${serializeScalar(value)}`);
    }
  }
  return lines.join("\n");
}

/** Serialize frontmatter + body into a complete document. */
export function serializeDocument(frontmatter, body) {
  return `---\n${serializeFrontmatterBlock(frontmatter)}\n---\n\n${body.replace(/^\r?\n/, "")}`;
}

/**
 * Normalize a mapped `faqs` value into `[{ question, answer }]`.
 *
 * Deliberately schema-agnostic: repos name the pair differently
 * (`question`/`answer`, `q`/`a`, `title`/`body`), so instead of demanding a
 * key convention we take each item's string fields in declaration order —
 * first is the question, second the answer. A plain string item counts as a
 * question with no answer. Anything else yields nulls, which the callers
 * report rather than crash on.
 */
export function normalizeFaqs(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return { question: item, answer: null };
    if (item === null || typeof item !== "object") return { question: null, answer: null };
    const strings = Object.values(item).filter((v) => typeof v === "string" && v.trim() !== "");
    return { question: strings[0] ?? null, answer: strings[1] ?? null };
  });
}
