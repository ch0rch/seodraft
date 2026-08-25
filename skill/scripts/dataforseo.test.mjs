import http from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { runDataForSeo } from "./dataforseo.mjs";
import { fixtureRoot } from "../../tests/helpers.mjs";

/** Local stand-in for api.dataforseo.com — each test sets `handler`. */
let server;
let baseUrl;
let handler = null;
let lastRequest = null;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      lastRequest = { url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null };
      handler(req, res);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  process.env.SEODRAFT_DATAFORSEO_BASE_URL = baseUrl;
});

afterAll(async () => {
  delete process.env.SEODRAFT_DATAFORSEO_BASE_URL;
  await new Promise((resolve) => server.close(resolve));
});

afterEach(() => {
  delete process.env.DATAFORSEO_LOGIN;
  delete process.env.DATAFORSEO_PASSWORD;
  handler = null;
  lastRequest = null;
});

function withCredentials() {
  process.env.DATAFORSEO_LOGIN = "user@example.com";
  process.env.DATAFORSEO_PASSWORD = "hunter2";
}

const envelope = (result) => JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, result }] });

describe("dataforseo.mjs", () => {
  it("degrades with missing-credentials and exit-0 contract when no creds exist", async () => {
    const result = await runDataForSeo(fixtureRoot, "volume", ["seo"]);
    expect(result).toEqual({ degraded: true, reason: "missing-credentials", results: [] });
  });

  it("volume: posts config locale and maps flat rows", async () => {
    withCredentials();
    handler = (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(envelope([{ keyword: "seo audit", search_volume: 480, keyword_difficulty: 22 }, { keyword: "seo gate", search_volume: null, keyword_difficulty: null }]));
    };
    const result = await runDataForSeo(fixtureRoot, "volume", ["seo audit", "seo gate"]);
    expect(lastRequest.url).toBe("/keywords_data/google_ads/search_volume/live");
    expect(lastRequest.auth).toBe(`Basic ${Buffer.from("user@example.com:hunter2").toString("base64")}`);
    expect(lastRequest.body).toEqual([{ keywords: ["seo audit", "seo gate"], language_code: "en", location_code: 2840 }]);
    expect(result).toEqual({
      degraded: false,
      results: [
        { term: "seo audit", volume: 480, difficulty: 22 },
        { term: "seo gate", volume: 0, difficulty: 0 },
      ],
    });
  });

  it("suggest: unwraps the Labs result[0].items nesting", async () => {
    withCredentials();
    handler = (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        envelope([
          {
            items: [
              {
                keyword: "seo for astro",
                keyword_info: { search_volume: 90 },
                keyword_properties: { keyword_difficulty: 12 },
                search_intent_info: { main_intent: "informational" },
              },
              { keyword: "bare row" },
            ],
          },
        ]),
      );
    };
    const result = await runDataForSeo(fixtureRoot, "suggest", ["seo"]);
    expect(lastRequest.url).toBe("/dataforseo_labs/google/keyword_suggestions/live");
    expect(lastRequest.body).toEqual([{ keyword: "seo", language_code: "en", location_code: 2840 }]);
    expect(result.results).toEqual([
      { term: "seo for astro", volume: 90, difficulty: 12, type: "informational" },
      { term: "bare row", volume: null, difficulty: null, type: null },
    ]);
  });

  it("degrades on HTTP failure", async () => {
    withCredentials();
    handler = (req, res) => {
      res.writeHead(500);
      res.end("boom");
    };
    const result = await runDataForSeo(fixtureRoot, "volume", ["seo"]);
    expect(result.degraded).toBe(true);
    expect(result.reason).toBe("provider-error");
    expect(result.results).toEqual([]);
  });

  it("degrades on an HTTP-200 provider error (envelope status_code >= 40000)", async () => {
    withCredentials();
    handler = (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status_code: 40101, status_message: "auth error", tasks: [] }));
    };
    const result = await runDataForSeo(fixtureRoot, "volume", ["seo"]);
    expect(result).toMatchObject({ degraded: true, reason: "provider-error", results: [] });
  });

  it("degrades on a task-level error status", async () => {
    withCredentials();
    handler = (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 40501, status_message: "invalid field" }] }));
    };
    const result = await runDataForSeo(fixtureRoot, "suggest", ["seo"]);
    expect(result).toMatchObject({ degraded: true, reason: "provider-error" });
  });
});
