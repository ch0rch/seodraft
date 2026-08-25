import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detect } from "./detect.mjs";
import { fixtureRoot } from "../../tests/helpers.mjs";

let tempRoot = null;
afterEach(() => {
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

describe("detect.mjs", () => {
  it("detects astro + content dir + frontmatter keys on the fixture", () => {
    const result = detect(fixtureRoot);
    expect(result.framework).toBe("astro");
    expect(result.contentDirCandidates).toEqual(["src/content/blog"]);
    expect(result.extension).toBe(".mdx");
    expect(result.sampleFrontmatterKeys["src/content/blog"]).toEqual(
      expect.arrayContaining(["title", "description", "pubDate", "heroImage", "tags", "draft"]),
    );
  });

  it("detects jekyll via _config.yml and _posts", () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "seodraft-detect-"));
    fs.writeFileSync(path.join(tempRoot, "_config.yml"), "title: x\n");
    fs.mkdirSync(path.join(tempRoot, "_posts"));
    fs.writeFileSync(path.join(tempRoot, "_posts", "2030-01-01-hello.md"), "---\ntitle: Hello\n---\nBody\n");
    const result = detect(tempRoot);
    expect(result.framework).toBe("jekyll");
    expect(result.contentDirCandidates).toEqual(["_posts"]);
    expect(result.extension).toBe(".md");
  });

  it("detects a Next + Keystatic repo and surfaces its schema file", () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "seodraft-detect-"));
    fs.writeFileSync(path.join(tempRoot, "next.config.mjs"), "export default {};\n");
    fs.writeFileSync(path.join(tempRoot, "keystatic.config.ts"), "export default {};\n");
    fs.mkdirSync(path.join(tempRoot, "content", "blog", "posts"), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, "content", "blog", "posts", "hello.mdoc"),
      "---\ntitle: Hello\nseo:\n  seoTitle: Hello meta\n---\nBody\n",
    );
    const result = detect(tempRoot);
    expect(result.framework).toBe("next");
    expect(result.contentDirCandidates).toEqual(["content/blog/posts"]);
    expect(result.extension).toBe(".mdoc");
    expect(result.schemaFiles).toEqual(["keystatic.config.ts"]);
    // The sample cannot see a field that is absent when false — this is
    // exactly why schemaFiles outranks it during the mapping interview.
    expect(result.sampleFrontmatterKeys["content/blog/posts"]).toEqual(["title", "seo"]);
  });
  it("returns unknown with no candidates on an empty dir", () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "seodraft-detect-"));
    expect(detect(tempRoot)).toEqual({
      framework: "unknown",
      contentDirCandidates: [],
      extension: ".md",
      schemaFiles: [],
      sampleFrontmatterKeys: {},
    });
  });
});
