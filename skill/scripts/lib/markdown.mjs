/**
 * Line-based Markdown scanner — no parser dependency. Extracts exactly what
 * the gate/audit/linkgraph rules need: headings, links, images, word count.
 * Fenced code blocks (``` toggling) are skipped entirely: code is neither
 * prose nor a source of headings/links.
 */

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
// Images first (`![alt](url)`), then links with a negative lookbehind so an
// image is never double-counted as a link.
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const LINK_RE = /(?<!!)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/**
 * Scan a Markdown body (frontmatter already stripped).
 * Returns `{ headings: [{level, text, line}], links: [{text, url, line}],
 * images: [{alt, url, line}], wordCount }`.
 */
export function scanMarkdown(body) {
  const headings = [];
  const links = [];
  const images = [];
  let wordCount = 0;
  let inFence = false;

  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const heading = line.match(HEADING_RE);
    if (heading) {
      headings.push({ level: heading[1].length, text: heading[2].trim(), line: i + 1 });
    }
    for (const match of line.matchAll(IMAGE_RE)) {
      images.push({ alt: match[1], url: match[2], line: i + 1 });
    }
    for (const match of line.matchAll(LINK_RE)) {
      links.push({ text: match[1], url: match[2], line: i + 1 });
    }

    // Word count over prose: strip markup that would inflate the count.
    const prose = line
      .replace(IMAGE_RE, "$1")
      .replace(LINK_RE, "$1")
      .replace(/^#{1,6}\s+/, "")
      .replace(/[*_`>#|-]+/g, " ");
    wordCount += prose.split(/\s+/).filter((token) => /\w/.test(token)).length;
  }

  return { headings, links, images, wordCount };
}

/** True when the URL points inside the same site (internal link). */
export function isInternalUrl(url) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return false; // http:, https:, mailto:, …
  if (url.startsWith("//")) return false; // protocol-relative external
  if (url.startsWith("#")) return false; // in-page anchor
  return true;
}

/**
 * Normalize an internal href to a slug candidate: strips query/hash,
 * leading/trailing slashes, and a trailing `.md`/`.mdx`/`.html` extension.
 * `/blog/my-post/` → `blog/my-post`; `./other-post.md` → `other-post`.
 */
export function normalizeInternalHref(url) {
  let path = url.split(/[?#]/)[0];
  path = path.replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "");
  path = path.replace(/\.(md|mdx|html)$/i, "");
  return path;
}
