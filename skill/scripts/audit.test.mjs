import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runAudit } from "./audit.mjs";
import { fixtureRoot, copyFixture } from "../../tests/helpers.mjs";

let tempRoot = null;
afterEach(() => {
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

const HEALTHY = "src/content/blog/deterministic-seo-gates.mdx";
const BROKEN = "src/content/blog/missing-description-post.mdx";
const ORPHAN = "src/content/blog/orphan-heading-skip.mdx";
const THIN = "src/content/blog/thin-content-copy.mdx";

describe("audit.mjs on the fixture", () => {
  it("returns exactly the seeded findings", () => {
    const result = runAudit(fixtureRoot);
    const failures = result.failures.map(({ rule, file }) => ({ rule, file }));
    expect(failures).toEqual(
      expect.arrayContaining([
        { rule: "duplicate-title", file: HEALTHY },
        { rule: "duplicate-title", file: THIN },
        { rule: "missing-description", file: BROKEN },
        { rule: "broken-internal-link", file: BROKEN },
        { rule: "heading-skip", file: ORPHAN },
        { rule: "missing-alt-text", file: ORPHAN },
      ]),
    );
    expect(failures).toHaveLength(6);

    const advisories = result.advisories.map(({ rule, file }) => ({ rule, file }));
    expect(advisories).toEqual(
      expect.arrayContaining([
        { rule: "orphan-page", file: ORPHAN },
        { rule: "thin-content", file: THIN },
      ]),
    );
    expect(advisories).toHaveLength(2);
  });

  it("--file filters findings to one post while keeping cross-post rules", () => {
    const result = runAudit(fixtureRoot, THIN);
    expect(result.failures.map((f) => f.rule)).toEqual(["duplicate-title"]);
    expect(result.advisories.map((a) => a.rule)).toEqual(["thin-content"]);
  });

  it("flags a stale post (mapped date older than 12 months) as advisory", () => {
    tempRoot = copyFixture();
    const file = path.join(tempRoot, HEALTHY);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("pubDate: 2030-06-01", "pubDate: 2020-01-01"));
    const result = runAudit(tempRoot);
    expect(result.advisories.map((a) => a.rule)).toContain("stale-post");
  });

  it("reports duplicate descriptions across posts", () => {
    tempRoot = copyFixture();
    const healthy = path.join(tempRoot, HEALTHY);
    const orphan = path.join(tempRoot, ORPHAN);
    const description = fs
      .readFileSync(healthy, "utf8")
      .match(/^description: (.*)$/m)[1];
    fs.writeFileSync(orphan, fs.readFileSync(orphan, "utf8").replace(/^description: .*$/m, `description: ${description}`));
    const result = runAudit(tempRoot);
    expect(result.failures.filter((f) => f.rule === "duplicate-description")).toHaveLength(2);
  });

  it("never blocks: missing config is the only error shortcut", () => {
    const result = runAudit("/nonexistent-root");
    expect(result.failures[0].rule).toBe("missing-config");
  });
});

describe("AEO audit rules (advisory: a legacy archive is an opportunity list)", () => {
  const AEO_FRONTMATTER = {
    title: "title",
    description: "description",
    date: "pubDate",
    updatedDate: "updatedDate",
    image: "heroImage",
    tags: "tags",
    draft: null,
    tldr: "seo.tldr",
    faqs: "faqs",
  };

  /** Remap the fixture to the AEO field set without touching its posts. */
  function aeoFixture() {
    const root = copyFixture();
    const configPath = path.join(root, ".seodraft", "config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.frontmatter = AEO_FRONTMATTER;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return root;
  }

  it("reports missing tldr and faqs as advisories, never as failures", () => {
    tempRoot = aeoFixture();
    const result = runAudit(tempRoot);
    const advisoryRules = result.advisories.map((a) => a.rule);
    expect(advisoryRules).toContain("missing-tldr");
    expect(advisoryRules).toContain("missing-faqs");
    const failureRules = result.failures.map((f) => f.rule);
    expect(failureRules).not.toContain("missing-tldr");
    expect(failureRules).not.toContain("missing-faqs");
  });

  it("reports a mapped-but-absent updatedDate as an advisory", () => {
    tempRoot = aeoFixture();
    // Fixture posts carry pubDate only, never updatedDate.
    const result = runAudit(tempRoot, HEALTHY);
    expect(result.advisories.map((a) => a.rule)).toContain("missing-updated-date");

    const file = path.join(tempRoot, HEALTHY);
    fs.writeFileSync(
      file,
      fs.readFileSync(file, "utf8").replace("pubDate: 2030-06-01", "pubDate: 2030-06-01\nupdatedDate: 2030-06-02"),
    );
    const fixed = runAudit(tempRoot, HEALTHY);
    expect(fixed.advisories.map((a) => a.rule)).not.toContain("missing-updated-date");
  });

  it("stale-post prefers updatedDate: a refreshed old post is not stale", () => {
    tempRoot = aeoFixture();
    const file = path.join(tempRoot, HEALTHY);
    // Published long ago, but refreshed recently -> not stale.
    fs.writeFileSync(
      file,
      fs
        .readFileSync(file, "utf8")
        .replace("pubDate: 2030-06-01", "pubDate: 2020-01-01\nupdatedDate: 2030-06-01"),
    );
    const refreshed = runAudit(tempRoot, HEALTHY);
    expect(refreshed.advisories.map((a) => a.rule)).not.toContain("stale-post");

    // Same post, never refreshed -> stale, from the published date.
    fs.writeFileSync(
      file,
      fs.readFileSync(file, "utf8").replace("updatedDate: 2030-06-01\n", ""),
    );
    const stale = runAudit(tempRoot, HEALTHY);
    expect(stale.advisories.map((a) => a.rule)).toContain("stale-post");
  });

  it("flags a stale updatedDate even when the post was once refreshed", () => {
    tempRoot = aeoFixture();
    const file = path.join(tempRoot, HEALTHY);
    fs.writeFileSync(
      file,
      fs.readFileSync(file, "utf8").replace("pubDate: 2030-06-01", "pubDate: 2019-01-01\nupdatedDate: 2020-01-01"),
    );
    const result = runAudit(tempRoot, HEALTHY);
    const stale = result.advisories.find((a) => a.rule === "stale-post");
    expect(stale.message).toContain("2020-01-01");
  });
});
