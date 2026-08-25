# /seodraft keywords — build the keyword bank

Adds keywords to `.seodraft/keywords.json` with real metrics when DataForSEO
is available and clearly-marked estimates when it is not. Requires a completed
`/seodraft init`.

All scripts run from the repo root; `dataforseo.mjs` reads `language` and
`locationCode` from `.seodraft/config.json` and credentials from env
(`DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`) or `.seodraft/config.local.json`.

---

## The bank

```json
{ "schemaVersion": 1, "keywords": [ {
  "term": "string (normalized lowercase)", "volume": 480, "difficulty": 22,
  "type": "informational|commercial|transactional|navigational",
  "source": "generate|add|chat|estimate", "status": "stored|planned|written",
  "addedAt": "ISO-8601", "articlePath": null } ] }
```

- `term` is normalized: lowercase, trimmed, single spaces. Normalize before
  comparing or inserting.
- `source` records where the entry came from: `generate` (derived from the
  profile), `add` (user-provided), `chat` (surfaced mid-conversation),
  `estimate` (metrics you estimated in degraded mode).
- `volume`/`difficulty` may be `null` **only** when `source` is `"estimate"`.
- `status` starts at `stored`; `/seodraft plan` moves it to `planned`,
  `/seodraft write` to `written` (with `articlePath` set).

## Three modes

Pick the mode from what the user asked; when ambiguous, ask which.

### generate

Derive candidates yourself, then enrich:

1. Read `.seodraft/profile.md`. From the business description, audiences, and
   competitors, propose 10–30 candidate terms the audiences would actually
   search — mix informational and commercial intent, in the configured
   `language`.
2. Enrich in one call:
   ```
   node scripts/dataforseo.mjs volume "term one" "term two" "term three"
   ```
3. Merge results into the bank (rules below) with `source: "generate"`.

### add

The user names the terms:

1. Normalize each term.
2. `node scripts/dataforseo.mjs volume "t1" "t2"` for metrics.
3. Merge with `source: "add"`.

### suggest

The user gives a seed and wants related terms:

1. ```
   node scripts/dataforseo.mjs suggest "seed term"
   ```
2. Present the suggestions with their metrics; let the user pick which to
   keep (or keep all if they said so).
3. Merge the kept ones with `source: "add"`.

## Script output

Successful calls return result rows:

```json
{ "results": [ { "term": "...", "volume": 480, "difficulty": 22, "type": "informational" } ] }
```

`type` is present on `suggest` rows (search intent); `volume` rows may omit
it — in that case classify the intent yourself when writing the bank entry.

## Degraded mode → estimate

Missing credentials or a provider failure is **not an error**: the script
exits 0 with

```json
{ "degraded": true, "reason": "missing-credentials", "results": [] }
```

(`reason` is `"missing-credentials"` or `"provider-error"`.) When you see
`degraded: true`:

1. Tell the user metrics are estimated and why (`reason`).
2. Estimate `volume`, `difficulty`, and `type` yourself from your knowledge
   of the market — or leave `volume`/`difficulty` as `null` when you have no
   basis.
3. Write those entries with `source: "estimate"`.

Never present estimates as measured data, and never invent a `results` array
that the script did not return.

## Merge rules

Applied for every mode, per term (normalized):

- **Dedupe by normalized term.** An incoming term already in the bank updates
  the existing entry; it never creates a duplicate.
- **Never downgrade real metrics to estimates.** If the existing entry has
  measured metrics (`source` ≠ `"estimate"`) and the incoming data is an
  estimate, keep the existing metrics. The reverse upgrade is allowed and
  wanted: fresh measured data replaces an old estimate, and the entry's
  `source` becomes the measured mode.
- Preserve `status`, `articlePath`, and `addedAt` on update; set `addedAt`
  to now (ISO-8601) only on insert.

## Finish

After every write to `keywords.json`:

```
node scripts/state.mjs validate
```

Must print `{"ok":true}`. Then summarize for the user: how many terms added
vs updated, how many are estimates, and suggest `/seodraft plan` when the
bank has unplanned terms.
