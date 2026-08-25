#!/usr/bin/env node
/**
 * DataForSEO client (optional keyword metrics), ported from the seodraft
 * SaaS adapter. Two endpoints:
 *
 *   node dataforseo.mjs volume "term one" "term two"
 *   node dataforseo.mjs suggest "seed term"
 *
 * `language`/`locationCode` come from `.seodraft/config.json`. Credentials:
 * env `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`, falling back to
 * `.seodraft/config.local.json` `{ "dataforseo": { "login", "password" } }`.
 *
 * Degraded mode is a CONTRACT, not an error: missing credentials or any
 * provider failure exits 0 with `{ degraded: true, reason, results: [] }`
 * so the skill falls back to agent-estimated metrics (`source: "estimate"`).
 * DataForSEO can answer HTTP 200 for provider-side errors (auth/quota), so
 * both the HTTP status and the envelope/task `status_code >= 40000` are
 * checked — either one degrades.
 */
import path from "node:path";
import { loadConfig, loadLocalConfig, output } from "./lib/config.mjs";

const DEFAULT_BASE_URL = "https://api.dataforseo.com/v3";
const DEFAULT_LOCATION_CODE = 2840; // United States

function resolveCredentials(root) {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (login && password) return { login, password };
  const local = loadLocalConfig(root);
  if (local?.dataforseo?.login && local?.dataforseo?.password) {
    return { login: local.dataforseo.login, password: local.dataforseo.password };
  }
  return null;
}

class ProviderError extends Error {}

async function post(baseUrl, auth, endpoint, body) {
  let response;
  try {
    response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${auth.login}:${auth.password}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([body]),
    });
  } catch (err) {
    throw new ProviderError(`request failed: ${String(err)}`);
  }
  if (!response.ok) throw new ProviderError(`HTTP ${response.status}`);
  let envelope;
  try {
    envelope = await response.json();
  } catch (err) {
    throw new ProviderError(`malformed response body: ${String(err)}`);
  }
  const task = envelope.tasks?.[0];
  if (envelope.status_code >= 40000 || !task || task.status_code >= 40000) {
    throw new ProviderError(task?.status_message ?? envelope.status_message ?? "provider error status");
  }
  return task.result ?? [];
}

export async function fetchVolume({ baseUrl, auth, terms, languageCode, locationCode }) {
  const rows = await post(baseUrl, auth, "/keywords_data/google_ads/search_volume/live", {
    keywords: terms,
    language_code: languageCode,
    location_code: locationCode ?? DEFAULT_LOCATION_CODE,
  });
  return rows.map((row) => ({
    term: row.keyword,
    volume: row.search_volume ?? 0,
    difficulty: row.keyword_difficulty ?? 0,
  }));
}

export async function fetchSuggestions({ baseUrl, auth, seed, languageCode, locationCode }) {
  const result = await post(baseUrl, auth, "/dataforseo_labs/google/keyword_suggestions/live", {
    keyword: seed,
    language_code: languageCode,
    location_code: locationCode ?? DEFAULT_LOCATION_CODE,
  });
  // Labs shape: keyword rows live in result[0].items, not in result itself.
  const items = result[0]?.items ?? [];
  return items.map((item) => ({
    term: item.keyword,
    volume: item.keyword_info?.search_volume ?? null,
    difficulty: item.keyword_properties?.keyword_difficulty ?? null,
    type: item.search_intent_info?.main_intent ?? null,
  }));
}

export async function runDataForSeo(root, command, args) {
  const config = loadConfig(root);
  const languageCode = config?.language ?? "en";
  const locationCode = config?.locationCode ?? DEFAULT_LOCATION_CODE;
  const baseUrl = process.env.SEODRAFT_DATAFORSEO_BASE_URL || DEFAULT_BASE_URL;

  const auth = resolveCredentials(root);
  if (auth === null) return { degraded: true, reason: "missing-credentials", results: [] };

  try {
    if (command === "volume") {
      if (args.length === 0) return { degraded: true, reason: "provider-error", results: [], message: "no terms given" };
      return { degraded: false, results: await fetchVolume({ baseUrl, auth, terms: args, languageCode, locationCode }) };
    }
    if (command === "suggest") {
      if (!args[0]) return { degraded: true, reason: "provider-error", results: [], message: "no seed given" };
      return { degraded: false, results: await fetchSuggestions({ baseUrl, auth, seed: args[0], languageCode, locationCode }) };
    }
    return { error: "unknown-command", message: 'usage: node dataforseo.mjs volume "t1" "t2" | suggest "seed"' };
  } catch (err) {
    if (err instanceof ProviderError) {
      return { degraded: true, reason: "provider-error", results: [], message: err.message };
    }
    throw err;
  }
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (isMain) {
  const [command, ...args] = process.argv.slice(2);
  const result = await runDataForSeo(process.cwd(), command, args);
  output(result, result.error ? 1 : 0);
}
