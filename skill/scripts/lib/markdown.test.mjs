import { describe, expect, it } from "vitest";
import { scanMarkdown, isInternalUrl, normalizeInternalHref } from "./markdown.mjs";

describe("scanMarkdown", () => {
  it("extracts headings, links, and images with positions", () => {
    const body = ["## Section", "", "See [the guide](/blog/guide) and ![diagram](/img/d.png).", "### Sub"].join("\n");
    const scan = scanMarkdown(body);
    expect(scan.headings).toEqual([
      { level: 2, text: "Section", line: 1 },
      { level: 3, text: "Sub", line: 4 },
    ]);
    expect(scan.links).toEqual([{ text: "the guide", url: "/blog/guide", line: 3 }]);
    expect(scan.images).toEqual([{ alt: "diagram", url: "/img/d.png", line: 3 }]);
  });

  it("skips fenced code blocks entirely (headings, links, words)", () => {
    const body = ["Real prose here.", "```js", "# not a heading", "[not a link](/nope)", "many fake words inside fence", "```", "## Real heading"].join("\n");
    const scan = scanMarkdown(body);
    expect(scan.headings).toEqual([{ level: 2, text: "Real heading", line: 7 }]);
    expect(scan.links).toEqual([]);
    expect(scan.wordCount).toBe(5); // "Real prose here" + "Real heading"
  });

  it("does not count an image as a link", () => {
    const scan = scanMarkdown("![alt](/img.png)");
    expect(scan.links).toEqual([]);
    expect(scan.images).toHaveLength(1);
  });
});

describe("internal url helpers", () => {
  it("classifies internal vs external", () => {
    expect(isInternalUrl("/blog/post")).toBe(true);
    expect(isInternalUrl("./post.md")).toBe(true);
    expect(isInternalUrl("https://example.com/x")).toBe(false);
    expect(isInternalUrl("mailto:a@b.c")).toBe(false);
    expect(isInternalUrl("//cdn.example.com/x")).toBe(false);
    expect(isInternalUrl("#anchor")).toBe(false);
  });

  it("normalizes hrefs to slug candidates", () => {
    expect(normalizeInternalHref("/blog/my-post/")).toBe("blog/my-post");
    expect(normalizeInternalHref("./other-post.md")).toBe("other-post");
    expect(normalizeInternalHref("/blog/my-post?q=1#frag")).toBe("blog/my-post");
  });
});
