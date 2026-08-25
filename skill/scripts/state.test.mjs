import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateState } from "./state.mjs";
import { fixtureRoot, copyFixture } from "../../tests/helpers.mjs";

let tempRoot = null;
afterEach(() => {
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

describe("state.mjs validate", () => {
  it("accepts the seeded fixture state", () => {
    expect(validateState(fixtureRoot)).toEqual({ ok: true });
  });

  it("rejects a mutated enum value", () => {
    tempRoot = copyFixture();
    const keywordsPath = path.join(tempRoot, ".seodraft", "keywords.json");
    const doc = JSON.parse(fs.readFileSync(keywordsPath, "utf8"));
    doc.keywords[0].status = "publishedish";
    fs.writeFileSync(keywordsPath, JSON.stringify(doc));
    const result = validateState(tempRoot);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("keywords[0]") && e.includes("status"))).toBe(true);
  });

  it("rejects null metrics on a non-estimate keyword", () => {
    tempRoot = copyFixture();
    const keywordsPath = path.join(tempRoot, ".seodraft", "keywords.json");
    const doc = JSON.parse(fs.readFileSync(keywordsPath, "utf8"));
    doc.keywords[0].volume = null; // source is "add"
    fs.writeFileSync(keywordsPath, JSON.stringify(doc));
    const result = validateState(tempRoot);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('volume may be null only when source is "estimate"'))).toBe(true);
  });

  it("rejects a calendar done entry without articlePath", () => {
    tempRoot = copyFixture();
    const calendarPath = path.join(tempRoot, ".seodraft", "calendar.json");
    const doc = JSON.parse(fs.readFileSync(calendarPath, "utf8"));
    doc.entries[0].articlePath = null;
    fs.writeFileSync(calendarPath, JSON.stringify(doc));
    const result = validateState(tempRoot);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('status "done" requires'))).toBe(true);
  });

  it("reports missing config.json", () => {
    tempRoot = copyFixture();
    fs.rmSync(path.join(tempRoot, ".seodraft", "config.json"));
    const result = validateState(tempRoot);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("config.json: missing"))).toBe(true);
  });
});
