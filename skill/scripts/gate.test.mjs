import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { runGate, titleJaccard } from "./gate.mjs";
import { fixtureRoot, makeTempSite, validBody, validFrontmatter } from "../../tests/helpers.mjs";

const HEALTHY = "src/content/blog/deterministic-seo-gates.mdx";
const BROKEN = "src/content/blog/missing-description-post.mdx";
const THIN = "src/content/blog/thin-content-copy.mdx";
const POST = "src/content/blog/post-under-test.mdx";

const roots = [];
afterEach(() => {
  while (roots.length > 0) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

/** Gate one synthetic post in an isolated temp site (link rules relaxed). */
function gateDoc(document, { configOverrides = {}, term = null, extraFiles = {} } = {}) {
  const root = makeTempSite({
    configOverrides: { internalLinksMin: 0, ...configOverrides },
    files: { [POST]: document, ...extraFiles },
  });
  roots.push(root);
  return runGate(root, POST, term);
}

const rulesOf = (result) => result.failures.map((f) => f.rule);
const advisoriesOf = (result) => result.advisories.map((a) => a.rule);

describe("gate.mjs on the fixture", () => {
  it("passes the healthy post (exit contract: ok true, no failures)", () => {
    const result = runGate(fixtureRoot, HEALTHY, "deterministic seo gates");
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("fails the broken post with the seeded rules", () => {
    const result = runGate(fixtureRoot, BROKEN, "broken links audit");
    expect(result.ok).toBe(false);
    expect(rulesOf(result).sort()).toEqual(["broken-internal-link", "frontmatter-complete", "internal-links-min"]);
  });
});

describe("gate rules, one passing and one failing case each", () => {
  it("frontmatter-parse", () => {
    const fail = gateDoc("---\nseo: { flow: map }\n---\n" + validBody());
    expect(rulesOf(fail)).toContain("frontmatter-parse");
    const pass = gateDoc(validFrontmatter() + validBody());
    expect(rulesOf(pass)).not.toContain("frontmatter-parse");
  });

  it("frontmatter-complete exempts a mapped draft flag that is absent", () => {
    // Keystatic omits a false checkbox, so every published post lacks
    // `draft`. Requiring it would fail the whole existing archive.
    const published = gateDoc(validFrontmatter({ draft: undefined }) + validBody(), {
      configOverrides: {
        frontmatter: { title: "title", description: "description", date: "pubDate", image: "heroImage", tags: "tags", draft: "draft" },
      },
    });
    expect(rulesOf(published)).not.toContain("frontmatter-complete");
    // A missing CONTENT field still fails.
    const missingContent = gateDoc(validFrontmatter({ heroImage: undefined }) + validBody());
    expect(rulesOf(missingContent)).toContain("frontmatter-complete");
  });

  it("frontmatter-complete", () => {
    const fail = gateDoc(validFrontmatter({ heroImage: undefined }) + validBody());
    expect(rulesOf(fail)).toContain("frontmatter-complete");
    const pass = gateDoc(validFrontmatter() + validBody());
    expect(rulesOf(pass)).not.toContain("frontmatter-complete");
    // null mapping = field unused: missing image no longer fails.
    const unmapped = gateDoc(validFrontmatter({ heroImage: undefined }) + validBody(), {
      configOverrides: { frontmatter: { title: "title", description: "description", date: "pubDate", image: null, tags: "tags", draft: "draft" } },
    });
    expect(rulesOf(unmapped)).not.toContain("frontmatter-complete");
  });

  it("title-length (max and min)", () => {
    const tooLong = gateDoc(validFrontmatter({ title: "T".repeat(61) + " over the sixty character ceiling" }) + validBody());
    expect(rulesOf(tooLong)).toContain("title-length");
    const tooShort = gateDoc(validFrontmatter({ title: "Tiny title" }) + validBody());
    expect(rulesOf(tooShort)).toContain("title-length");
    const pass = gateDoc(validFrontmatter() + validBody());
    expect(rulesOf(pass)).not.toContain("title-length");
  });

  it("description-length", () => {
    const tooShort = gateDoc(validFrontmatter({ description: "Way too short." }) + validBody());
    expect(rulesOf(tooShort)).toContain("description-length");
    const tooLong = gateDoc(validFrontmatter({ description: "d".repeat(161) }) + validBody());
    expect(rulesOf(tooLong)).toContain("description-length");
    const pass = gateDoc(validFrontmatter() + validBody());
    expect(rulesOf(pass)).not.toContain("description-length");
  });

  it("h1-policy", () => {
    const fail = gateDoc(validFrontmatter() + "# Rogue H1\n" + validBody());
    expect(rulesOf(fail)).toContain("h1-policy");
    const pass = gateDoc(validFrontmatter() + validBody());
    expect(rulesOf(pass)).not.toContain("h1-policy");
    // bodyH1: true flips the expectation: exactly one H1 required.
    const wantsH1 = gateDoc(validFrontmatter() + validBody(), { configOverrides: { bodyH1: true } });
    expect(rulesOf(wantsH1)).toContain("h1-policy");
    const hasH1 = gateDoc(validFrontmatter() + "# The Title\n" + validBody(), { configOverrides: { bodyH1: true } });
    expect(rulesOf(hasH1)).not.toContain("h1-policy");
  });

  it("heading-structure (H2 count and level skips)", () => {
    const oneH2 = gateDoc(validFrontmatter() + "## Only section\n\nprose\n");
    expect(rulesOf(oneH2)).toContain("heading-structure");
    const skip = gateDoc(validFrontmatter() + "## A\n\n#### Skipped\n\n## B\n");
    expect(rulesOf(skip)).toContain("heading-structure");
    const pass = gateDoc(validFrontmatter() + validBody());
    expect(rulesOf(pass)).not.toContain("heading-structure");
  });

  it("internal-links-min", () => {
    const other = "src/content/blog/neighbor-one.mdx";
    const other2 = "src/content/blog/neighbor-two.mdx";
    const extraFiles = {
      [other]: validFrontmatter({ title: "Neighbor One Post About Testing" }) + validBody(),
      [other2]: validFrontmatter({ title: "Neighbor Two Post About Testing" }) + validBody(),
    };
    const fail = gateDoc(validFrontmatter() + validBody({ links: ["/blog/neighbor-one"] }), {
      configOverrides: { internalLinksMin: 2 },
      extraFiles,
    });
    expect(rulesOf(fail)).toContain("internal-links-min");
    const pass = gateDoc(validFrontmatter() + validBody({ links: ["/blog/neighbor-one", "/blog/neighbor-two"] }), {
      configOverrides: { internalLinksMin: 2 },
      extraFiles,
    });
    expect(rulesOf(pass)).not.toContain("internal-links-min");
  });

  it("broken-internal-link", () => {
    const fail = gateDoc(validFrontmatter() + validBody({ links: ["/blog/ghost-post"] }));
    expect(rulesOf(fail)).toContain("broken-internal-link");
    const pass = gateDoc(validFrontmatter() + validBody({ links: ["https://example.com/external"] }));
    expect(rulesOf(pass)).not.toContain("broken-internal-link");
  });

  it("cannibalization (hard stop on a term another post owns)", () => {
    const fail = runGate(fixtureRoot, THIN, "deterministic seo gates");
    expect(rulesOf(fail)).toContain("cannibalization");
    // Same term gating the post that owns it: no cannibalization.
    const pass = runGate(fixtureRoot, HEALTHY, "deterministic seo gates");
    expect(rulesOf(pass)).not.toContain("cannibalization");
  });

  it("cannibalization-fuzzy advisory on near-duplicate titles", () => {
    const fail = runGate(fixtureRoot, HEALTHY, null);
    expect(advisoriesOf(fail)).toContain("cannibalization-fuzzy");
    const pass = runGate(fixtureRoot, "src/content/blog/orphan-heading-skip.mdx", null);
    expect(advisoriesOf(pass)).not.toContain("cannibalization-fuzzy");
  });

  it("placeholder-text", () => {
    for (const marker of ["TODO", "lorem ipsum", "As an AI", "[insert"]) {
      const fail = gateDoc(validFrontmatter() + validBody() + `\nParagraph with ${marker} inside.\n`);
      expect(rulesOf(fail)).toContain("placeholder-text");
    }
    const pass = gateDoc(validFrontmatter() + validBody());
    expect(rulesOf(pass)).not.toContain("placeholder-text");
  });

  it("thin-content advisory", () => {
    const thin = gateDoc(validFrontmatter() + validBody({ words: 10 }));
    expect(advisoriesOf(thin)).toContain("thin-content");
    expect(thin.failures.map((f) => f.rule)).not.toContain("thin-content"); // advisory, never blocks
    const pass = gateDoc(validFrontmatter() + validBody({ words: 600 }));
    expect(advisoriesOf(pass)).not.toContain("thin-content");
  });
});

describe("titleJaccard", () => {
  it("is 1 for identical titles and 0 for disjoint ones", () => {
    expect(titleJaccard("Alpha Beta", "alpha beta")).toBe(1);
    expect(titleJaccard("Alpha Beta", "Gamma Delta")).toBe(0);
  });
});

describe("dot-path frontmatter mapping (.mdoc / Keystatic)", () => {
  it("gates nested seo fields via dot-paths and the configured extension", () => {
    const document = [
      "---",
      "title: >-",
      "  A long human title that the layout renders, well over the meta budget",
      "publishedDate: 2030-06-01",
      "coverImage: /images/x.webp",
      "category: seo-local",
      "seo:",
      "  seoTitle: Nested Meta Title Under Sixty",
      "  seoDescription: >-",
      "    A nested meta description comfortably longer than the fifty character",
      "    minimum the gate enforces.",
      "---",
      "",
      validBody(),
    ].join("\n");
    const root = makeTempSite({
      configOverrides: {
        extension: ".mdoc",
        internalLinksMin: 0,
        frontmatter: {
          title: "seo.seoTitle",
          description: "seo.seoDescription",
          date: "publishedDate",
          image: "coverImage",
          tags: "category",
          draft: null,
        },
      },
      files: { "src/content/blog/nested-post.mdoc": document },
    });
    roots.push(root);
    const result = runGate(root, "src/content/blog/nested-post.mdoc", null);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("AEO rules (gate errors so new content cannot regress)", () => {
  const AEO_CONFIG = {
    internalLinksMin: 0,
    frontmatter: {
      title: "title",
      description: "description",
      date: "pubDate",
      updatedDate: null,
      image: "heroImage",
      tags: "tags",
      draft: null,
      tldr: "seo.tldr",
      faqs: "faqs",
    },
  };

  /** Build a post whose nested `seo.tldr` and `faqs` are set explicitly. */
  function aeoDoc({ tldr, faqCount = 3, answer = "A short quotable answer." }) {
    const faqs = Array.from({ length: faqCount }, (_, i) =>
      [`  - question: Question number ${i + 1}?`, `    answer: ${answer}`].join("\n"),
    );
    return [
      "---",
      'title: "A Perfectly Reasonable Title Here"',
      'description: "A description that is comfortably long enough to satisfy the fifty character minimum rule."',
      "pubDate: 2030-06-01",
      'heroImage: "/images/x.png"',
      'tags: ["seo"]',
      "seo:",
      `  tldr: ${JSON.stringify(tldr)}`,
      ...(faqCount > 0 ? ["faqs:", ...faqs] : []),
      "---",
      "",
      validBody(),
    ].join("\n");
  }

  const GOOD_TLDR =
    "Appearing on the local map is free and takes about a week to verify; once verified your position depends on category, proximity and prominence.";

  it("passes a post with a well-sized tldr and enough faqs", () => {
    const result = gateDoc(aeoDoc({ tldr: GOOD_TLDR }), { configOverrides: AEO_CONFIG });
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("tldr-length fails a teaser and an overlong block", () => {
    const short = gateDoc(aeoDoc({ tldr: "Too short to answer anything." }), { configOverrides: AEO_CONFIG });
    expect(rulesOf(short)).toContain("tldr-length");
    const long = gateDoc(aeoDoc({ tldr: "x".repeat(401) }), { configOverrides: AEO_CONFIG });
    expect(rulesOf(long)).toContain("tldr-length");
  });

  it("frontmatter-complete catches a mapped-but-absent tldr, not tldr-length", () => {
    const document = aeoDoc({ tldr: GOOD_TLDR }).replace(/  tldr: .*\n/, "");
    const result = gateDoc(document, { configOverrides: AEO_CONFIG });
    expect(rulesOf(result)).toContain("frontmatter-complete");
    expect(rulesOf(result)).not.toContain("tldr-length");
  });

  it("faqs-min fails below the configured floor", () => {
    const result = gateDoc(aeoDoc({ tldr: GOOD_TLDR, faqCount: 2 }), { configOverrides: AEO_CONFIG });
    expect(rulesOf(result)).toContain("faqs-min");
    const ok = gateDoc(aeoDoc({ tldr: GOOD_TLDR, faqCount: 3 }), { configOverrides: AEO_CONFIG });
    expect(rulesOf(ok)).not.toContain("faqs-min");
  });

  it("faq-answer-length is advisory, never blocking", () => {
    const result = gateDoc(aeoDoc({ tldr: GOOD_TLDR, answer: "y".repeat(501) }), { configOverrides: AEO_CONFIG });
    expect(advisoriesOf(result)).toContain("faq-answer-length");
    expect(rulesOf(result)).not.toContain("faq-answer-length");
  });

  it("null mappings disable the AEO rules entirely", () => {
    const result = gateDoc(validFrontmatter() + validBody(), {
      configOverrides: { internalLinksMin: 0 }, // fixture config maps tldr/faqs to null
    });
    expect(rulesOf(result)).not.toContain("tldr-length");
    expect(rulesOf(result)).not.toContain("faqs-min");
  });
});
