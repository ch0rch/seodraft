import { describe, expect, it } from "vitest";
import { buildInventory } from "./linkgraph.mjs";
import { fixtureRoot } from "../../tests/helpers.mjs";

describe("linkgraph.mjs inventory", () => {
  const inventory = buildInventory(fixtureRoot);
  const bySlug = new Map(inventory.posts.map((post) => [post.slug, post]));

  it("finds all four fixture posts with titles and word counts", () => {
    expect(inventory.posts).toHaveLength(4);
    expect(bySlug.get("deterministic-seo-gates").title).toBe("Deterministic SEO Gates for Static Blogs");
    expect(bySlug.get("deterministic-seo-gates").wordCount).toBeGreaterThanOrEqual(500);
    expect(bySlug.get("thin-content-copy").wordCount).toBeLessThan(500);
  });

  it("resolves outbound internal links to slugs", () => {
    expect(bySlug.get("deterministic-seo-gates").outboundInternal.sort()).toEqual([
      "missing-description-post",
      "thin-content-copy",
    ]);
    expect(bySlug.get("missing-description-post").outboundInternal).toEqual(["deterministic-seo-gates"]);
  });

  it("lists unresolvable internal links under brokenInternal", () => {
    expect(bySlug.get("missing-description-post").brokenInternal).toEqual(["/blog/does-not-exist"]);
    expect(bySlug.get("deterministic-seo-gates").brokenInternal).toEqual([]);
  });

  it("reports the missing description as null", () => {
    expect(bySlug.get("missing-description-post").description).toBeNull();
    expect(bySlug.get("deterministic-seo-gates").description).not.toBeNull();
  });

  it("errors cleanly without config", () => {
    expect(buildInventory("/nonexistent-root").error).toBe("missing-config");
  });
});
