import { describe, expect, it } from "vitest";
import { parseDocument, serializeDocument, getMappedValue } from "./frontmatter.mjs";

describe("frontmatter subset", () => {
  it("round-trips string, number, boolean, ISO date, flat string array", () => {
    const frontmatter = {
      title: "Deterministic SEO Gates",
      description: "A description: with punctuation, commas",
      pubDate: "2030-06-01",
      order: 3,
      draft: false,
      tags: ["seo", "automation"],
    };
    const body = "## Heading\n\nSome body text.\n";
    const doc = serializeDocument(frontmatter, body);
    const parsed = parseDocument(doc);
    expect(parsed.error).toBeUndefined();
    expect(parsed.frontmatter).toEqual(frontmatter);
    expect(parsed.body).toBe(body);
  });

  it("parses inline arrays with quoted, comma-containing items", () => {
    const parsed = parseDocument('---\ntags: ["a, b", c]\n---\nbody');
    expect(parsed.frontmatter.tags).toEqual(["a, b", "c"]);
  });

  it("parses block-style arrays", () => {
    const parsed = parseDocument("---\ntags:\n  - seo\n  - automation\n---\nbody");
    expect(parsed.frontmatter.tags).toEqual(["seo", "automation"]);
  });

  it("keeps ISO dates as strings and serializes them unquoted", () => {
    const parsed = parseDocument("---\npubDate: 2030-06-01\n---\n");
    expect(parsed.frontmatter.pubDate).toBe("2030-06-01");
    const doc = serializeDocument({ pubDate: "2030-06-01" }, "");
    expect(doc).toContain("pubDate: 2030-06-01");
  });

  it("returns unparseable-frontmatter for YAML anchors instead of crashing", () => {
    const parsed = parseDocument("---\nimage: &anchor /a.png\nother: *anchor\n---\nbody");
    expect(parsed.error).toBe("unparseable-frontmatter");
  });

  it("returns unparseable-frontmatter when the closing fence is missing", () => {
    const parsed = parseDocument("---\ntitle: x\nbody without closing fence");
    expect(parsed.error).toBe("unparseable-frontmatter");
  });

  it("returns frontmatter null when there is no block at all", () => {
    const parsed = parseDocument("just a body\n");
    expect(parsed.frontmatter).toBeNull();
    expect(parsed.body).toBe("just a body\n");
  });
});

describe("nested frontmatter (Keystatic/.mdoc shapes)", () => {
  const MDOC = [
    "---",
    "title: >-",
    "  Qué es la búsqueda local: La guía simple para entender cómo te encuentran",
    "  tus clientes",
    "publishedDate: 2026-01-31",
    "category: seo-local",
    "seo:",
    "  seoTitle: 'Qué es la búsqueda local: Guía completa'",
    "  seoDescription: >-",
    "    Descubrí qué es la búsqueda local, por qué es crucial para tu negocio y",
    "    cómo aparecer cuando tus clientes te buscan.",
    "faqs:",
    "  - question: ¿Qué es exactamente una búsqueda local?",
    "    answer: >-",
    "      Es cuando alguien busca un producto o servicio específico en su área",
    "      geográfica.",
    "  - question: ¿Necesito un sitio web?",
    "    answer: No es obligatorio, pero ayuda.",
    "---",
    "",
    "Body text.",
  ].join("\n");

  it("parses folded block scalars, joining lines with spaces", () => {
    const parsed = parseDocument(MDOC);
    expect(parsed.error).toBeUndefined();
    expect(parsed.frontmatter.title).toBe(
      "Qué es la búsqueda local: La guía simple para entender cómo te encuentran tus clientes",
    );
  });

  it("parses nested maps and lists of maps", () => {
    const { frontmatter } = parseDocument(MDOC);
    expect(frontmatter.seo.seoTitle).toBe("Qué es la búsqueda local: Guía completa");
    expect(frontmatter.seo.seoDescription).toMatch(/^Descubrí qué es la búsqueda local, .* te buscan\.$/);
    expect(frontmatter.faqs).toHaveLength(2);
    expect(frontmatter.faqs[1]).toEqual({
      question: "¿Necesito un sitio web?",
      answer: "No es obligatorio, pero ayuda.",
    });
    expect(frontmatter.publishedDate).toBe("2026-01-31");
  });

  it("literal block scalars keep newlines; clip keeps one trailing newline", () => {
    const parsed = parseDocument("---\nnotes: |\n  line one\n  line two\n---\n");
    expect(parsed.frontmatter.notes).toBe("line one\nline two\n");
  });

  it("rejects tabs and flow maps as unparseable", () => {
    expect(parseDocument("---\n\tkey: value\n---\n").error).toBe("unparseable-frontmatter");
    expect(parseDocument("---\nseo: { a: 1 }\n---\n").error).toBe("unparseable-frontmatter");
  });
});

describe("getMappedValue", () => {
  const frontmatter = { title: "top", seo: { seoTitle: "nested" }, "dotted.key": "literal" };

  it("resolves plain keys, dot-paths, and literal dotted keys", () => {
    expect(getMappedValue(frontmatter, "title")).toBe("top");
    expect(getMappedValue(frontmatter, "seo.seoTitle")).toBe("nested");
    expect(getMappedValue(frontmatter, "dotted.key")).toBe("literal");
  });

  it("returns undefined for missing segments and null frontmatter", () => {
    expect(getMappedValue(frontmatter, "seo.missing")).toBeUndefined();
    expect(getMappedValue(null, "title")).toBeUndefined();
  });
});
