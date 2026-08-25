# Seodraft Local v1 — Product Requirements

## Positioning

**Outrank for your repo, powered by the agent you already pay for.** Seodraft
Local is a local-first SEO/AEO content engine distributed as an npm package.
`npx seodraft install` drops an agent skill plus a set of deterministic Node
scripts into the AI harness the user already runs — Claude Code, Codex, Cursor,
Gemini CLI, or OpenCode. The client's own agent is the LLM: no model API keys
ship with the product, no cloud backend holds the content, and every artifact
(state, keywords, calendar, articles) is a file in the client's own git repo.
The workflow follows the blogEO philosophy: **the agent proposes, deterministic
code gates, the human approves.**

## Target user

A technical developer or founder who owns their site: a Markdown/MDX content
repo built with Astro, Next.js, Hugo, or Jekyll, published through their
existing pipeline. They already pay for an AI coding agent and want an SEO
content operation — keyword research, an editorial calendar, gated article
generation, and a content audit — without a SaaS subscription, without handing
their content to a third party, and without any step they cannot read in a
diff.

## What ships

One npm package (`seodraft`, Apache-2.0) containing:

- **The skill**: `SKILL.md` router plus `reference/<command>.md` per verb,
  installed into each detected harness folder.
- **Deterministic scripts** under `scripts/` next to the skill: dependency-free
  Node ≥18 ESM (`node:fs`, `node:path`, global `fetch` only), runnable inside
  any harness with no install step.
- **The installer**: `npx seodraft install` / `update`, plus `audit | gate |
  keywords` subcommands that delegate to the same scripts for CI use without a
  harness.

## Provider support matrix

| provider | harness folder | install path |
| --- | --- | --- |
| Claude Code | `.claude` | `.claude/skills/seodraft/` |
| Codex | `.agents` | `.agents/skills/seodraft/` |
| Cursor | `.cursor` | `.cursor/skills/seodraft/` |
| Gemini CLI | `.gemini` | `.gemini/skills/seodraft/` |
| OpenCode | `.opencode` | `.opencode/skills/seodraft/` |

Skill content is identical across providers; only the wrapper folder differs.
Both project-local and global (`~/.claude` etc.) scopes are supported.

Deferred out of v1: GSC OAuth + opportunity scoring, AEO citation tracking
(measuring whether answer engines actually quote you — v1 enforces the
citable structure, it does not measure citations), WordPress publishing,
image generation, and paid pro.

---

## Client-project state

`/seodraft init` creates a `.seodraft/` directory in the client repo:

```
.seodraft/config.json         # committed
.seodraft/profile.md          # committed — business, audience, competitors, voice, global instructions
.seodraft/keywords.json       # committed
.seodraft/calendar.json       # committed
.seodraft/config.local.json   # gitignored — {"dataforseo": {"login": "...", "password": "..."}}
```

The agent edits the JSON state files directly and runs
`node scripts/state.mjs validate` after every write. `validate` checks all four
state files against the schemas below and prints `{"ok":true}` or
`{"ok":false,"errors":[...]}`, exiting 1 on invalid.

### `config.json`

```json
{
  "schemaVersion": 1,
  "siteUrl": "https://example.com",
  "language": "en",
  "locationCode": 2840,
  "framework": "astro",
  "contentDir": "src/content/blog",
  "extension": ".mdx",
  "frontmatter": {
    "title": "title", "description": "description",
    "date": "pubDate", "updatedDate": "updatedDate",
    "image": "heroImage", "tags": "tags", "draft": "draft",
    "tldr": "tldr", "faqs": "faqs"
  },
  "bodyH1": false,
  "internalLinksMin": 2,
  "thinContentWords": 500,
  "titleMax": 60,
  "descriptionMax": 160,
  "tldrMin": 100,
  "tldrMax": 400,
  "faqsMin": 3,
  "faqAnswerMax": 500
}
```

`frontmatter` maps the **nine canonical fields** — `title`, `description`,
`date`, `updatedDate`, `image`, `tags`, `draft`, `tldr`, `faqs` — to the
client's own keys. Every one of the nine keys must be present in the object;
the value `null` means the field is unused by this site, and every rule that
depends on it is skipped. A value may be a **dot-path into nested
frontmatter**: a repo whose meta lives under `seo:` maps
`"tldr": "seo.tldr"`. `bodyH1: false` means the layout renders the title, so
the article body must contain **zero** H1s — the gate enforces this.
`language`/`locationCode` feed the DataForSEO calls; generated articles follow
`language`.

`tldrMin`/`tldrMax` bound the TL;DR length (chars), `faqsMin` is the minimum
number of FAQ entries, and `faqAnswerMax` caps a single FAQ answer so it stays
short enough to be quoted whole. `schemaVersion` stays `1`: the product is
unreleased, so the v1 schema is still being defined and there is no migration
from a narrower shape.

#### The AEO fields: `updatedDate`, `tldr`, `faqs`

These three exist because a real end-to-end run against a production
Next + Keystatic blog (mostrador.ar) showed the six-field model was blind to
the most AEO-relevant frontmatter on the page. That repo's schema labels its
`updatedDate` field literally "Freshness signal for AI & Google" and its
JSON-LD builder feeds it to `dateModified`, while seodraft's `stale-post` rule
read only the published date — so a post that *had* been refreshed still
looked stale, which is backwards for an audit whose whole purpose is driving
refreshes. The same schema already carried a `tldr` field and a `faqs` array,
and the writing agent filled both unprompted, yet seodraft neither required
nor validated either — even though a labeled TL;DR and quotable Q&A pairs are
precisely what answer engines lift into an answer (blogEO gates on a labeled
TL;DR for exactly this reason). Mapping any of the three to `null` disables
its rules, so sites without them are unaffected; sites that have them get
them enforced.

### `profile.md`

Free-form committed Markdown holding the business description, target
audiences (max 7), competitors (max 7), brand voice, and global writing
instructions. The write pipeline reads it on every article; it is the local
equivalent of the SaaS onboarding profile.

### `keywords.json`

```json
{ "schemaVersion": 1, "keywords": [ {
  "term": "string (normalized lowercase)", "volume": 480, "difficulty": 22,
  "type": "informational|commercial|transactional|navigational",
  "source": "generate|add|chat|estimate", "status": "stored|planned|written",
  "addedAt": "ISO-8601", "articlePath": null } ] }
```

`source: "estimate"` marks LLM-estimated metrics (degraded mode);
`volume`/`difficulty` may be `null` only for estimates.

### `calendar.json`

```json
{ "schemaVersion": 1, "entries": [ {
  "term": "string", "scheduledDate": "YYYY-MM-DD", "customInstructions": "",
  "status": "scheduled|writing|done|failed", "articlePath": null, "failedReason": null } ] }
```

### `config.local.json`

Gitignored (the installer's init flow appends a marker-wrapped block to
`.gitignore`). Holds DataForSEO credentials:
`{"dataforseo": {"login": "...", "password": "..."}}`. Environment variables
`DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` take precedence when set.

---

## The six commands

All commands are agent flows routed by `SKILL.md` to a reference doc. Scripts
always run from the client repo root and read `.seodraft/config.json` there.

### `/seodraft init` → `reference/init.md`

1. Run `node scripts/detect.mjs` → `{"framework","contentDirCandidates","extension","sampleFrontmatterKeys"}`.
2. Confirm or ask for `contentDir` and the frontmatter mapping against
   `sampleFrontmatterKeys`.
3. Interview the user for business, audiences (≤7), competitors (≤7), voice,
   and global instructions — offering to autocomplete by fetching `siteUrl`
   with the agent's own web tool and extracting the profile.
4. Write `config.json` + `profile.md`; seed empty `keywords.json` and
   `calendar.json`; append the gitignore block wrapped in
   `# seodraft-ignore-start` / `# seodraft-ignore-end` covering
   `.seodraft/config.local.json`.
5. `node scripts/state.mjs validate`.

### `/seodraft keywords` → `reference/keywords.md`

Three modes, mirroring the SaaS:

- **generate** — the agent derives candidates from `profile.md` competitors and
  audiences, then enriches via `node scripts/dataforseo.mjs volume "t1" "t2"`.
- **add** — user-provided terms → the same `volume` lookup.
- **suggest** — a seed term → `node scripts/dataforseo.mjs suggest "seed"`.

All modes merge into `keywords.json`: dedupe by normalized term, never
downgrade real metrics to estimates. When DataForSEO answers
`{"degraded":true,...}` (missing credentials or provider error, always exit 0),
the agent estimates metrics itself and marks `source: "estimate"`.

### `/seodraft plan` → `reference/plan.md`

Schedule stored keywords into `calendar.json` by explicit date or "next N
slots". Refuse terms already `written`. Each entry may carry
`customInstructions` for the write step.

### `/seodraft write` → `reference/write.md`

The article pipeline, porting the SaaS prompt chain
(research → outline → body → meta) as agent guidance:

1. `node scripts/linkgraph.mjs inventory` → pick ≥ `internalLinksMin`
   topically relevant internal link targets.
2. Research with the harness's web tool when available; otherwise write from
   knowledge and cite **no** URLs.
3. Outline → body (voice from `profile.md`, entry `customInstructions`,
   configured `language`) → title/slug/meta with deterministic
   `descriptionMax` truncation.
4. Write `<contentDir>/<slug><extension>` with mapped frontmatter: `date`
   **and** `updatedDate` set to today, `tldr` and `faqs` filled when mapped,
   `draft` true when mapped.
5. `node scripts/gate.mjs <file> --term "<term>"`. On failure: fix and
   re-gate, **max 2 redrafts**, then mark the calendar entry `failed` with
   `failedReason` and stop. Cannibalization is a hard stop — never rephrase
   around it.
6. On pass: calendar entry `done` + `articlePath`; keyword `written` +
   `articlePath`; `node scripts/state.mjs validate`.

### `/seodraft audit` → `reference/audit.md`

Run `node scripts/audit.mjs` (optionally `--file <path>`), group findings by
rule, propose concrete per-file fixes as diffs, apply only after the user
approves in-conversation, re-run on touched files to confirm.

When an approved fix changes a post's content, bump that post's `updatedDate`
to today. That is the freshness signal doing its job: it is what the site's
JSON-LD feeds to `dateModified`, and it is what `stale-post` reads on the next
audit.

### `/seodraft status` → `reference/status.md`

Read the state files; report the calendar queue, keyword coverage
(stored/planned/written), and last audit finding counts.

---

## Deterministic scripts

All scripts print a single JSON object to stdout.

| script | contract |
| --- | --- |
| `state.mjs validate` | `{"ok":true}` or `{"ok":false,"errors":[...]}`; exit 1 on invalid |
| `detect.mjs` | `{"framework","contentDirCandidates","extension","sampleFrontmatterKeys"}`; unknown framework → `{"framework":"unknown","contentDirCandidates":[]}` |
| `linkgraph.mjs inventory` | `{"posts":[{"path","slug","title","description","headings","outboundInternal","brokenInternal","wordCount"}]}` |
| `gate.mjs <file> --term "<term>"` | `{"ok","failures","advisories"}`; exit 1 on any error-severity failure |
| `audit.mjs [--file <path>]` | same shape as gate; **always exit 0** — findings are the product |
| `dataforseo.mjs volume "t1" "t2"` / `suggest "seed"` | result rows `{term, volume, difficulty, type?}`; degraded mode: exit 0 with `{"degraded":true,"reason":"missing-credentials"\|"provider-error","results":[]}` |

Gate and audit findings are items
`{ "rule", "file", "message", "severity": "error"|"advisory" }`.

### Gate rules (pre-publish, blogEO-style)

| rule | severity | check |
| --- | --- | --- |
| `frontmatter-parse` | error | frontmatter parses |
| `frontmatter-complete` | error | every non-null mapped field present and non-empty |
| `title-length` | error | mapped title ≤ `titleMax` chars, ≥ 15 |
| `description-length` | error | mapped description ≤ `descriptionMax`, ≥ 50 |
| `h1-policy` | error | body H1 count == (`bodyH1` ? 1 : 0) |
| `heading-structure` | error | ≥ 2 H2s; no level skips (H2→H4) |
| `internal-links-min` | error | ≥ `internalLinksMin` internal links, all resolving via linkgraph |
| `broken-internal-link` | error | no internal link to a nonexistent slug |
| `cannibalization` | error | target term (arg `--term`) not equal to another keyword entry with non-null `articlePath` |
| `cannibalization-fuzzy` | advisory | token Jaccard ≥ 0.6 between new title and an existing post title |
| `placeholder-text` | error | body contains none of: `TODO`, `lorem ipsum`, `As an AI`, `[insert` |
| `thin-content` | advisory | wordCount < `thinContentWords` |
| `tldr-length` | error | when `tldr` is mapped: length within [`tldrMin`, `tldrMax`] |
| `faqs-min` | error | when `faqs` is mapped: at least `faqsMin` items |
| `faq-answer-length` | advisory | each FAQ answer ≤ `faqAnswerMax` chars |

### Audit rules (existing content, deterministic only — no GSC in v1)

| rule | severity | check |
| --- | --- | --- |
| `missing-title` | error | no mapped title in frontmatter |
| `missing-description` | error | no mapped description |
| `title-length` | error | outside 15–`titleMax` chars |
| `description-length` | error | outside 50–`descriptionMax` chars |
| `duplicate-title` | error | same title on two or more posts |
| `duplicate-description` | error | same description on two or more posts |
| `broken-internal-link` | error | internal link to a nonexistent slug |
| `heading-skip` | error | heading level jump (H2→H4) |
| `missing-alt-text` | error | image without alt text |
| `orphan-page` | advisory | zero inbound internal links |
| `thin-content` | advisory | wordCount < `thinContentWords` |
| `stale-post` | advisory | mapped `updatedDate` older than 12 months, falling back to `date` when `updatedDate` is unmapped |
| `missing-updated-date` | advisory | `updatedDate` mapped but absent — `dateModified` silently falls back to the published date, so a refresh can never register |
| `missing-tldr` | advisory | `tldr` mapped but absent or empty |
| `missing-faqs` | advisory | `faqs` mapped but absent or empty |
| `tldr-length` | advisory | outside [`tldrMin`, `tldrMax`] |
| `faq-answer-length` | advisory | an answer over `faqAnswerMax` chars |

Reuses linkgraph + the markdown scanner; no new parsing.

### Why the AEO rules are gate errors but audit advisories

The split is deliberate. The gate errors on `tldr-length` and `faqs-min`
because new content is where the standard is enforced: an article seodraft
writes today has no excuse for missing the fields the site's own schema
declares. The audit keeps the same AEO rules advisory because a legacy
archive predates the standard — erroring every one of a hundred old posts
produces noise, not signal, and buries the findings that matter. Unambiguous
defects stay errors in the audit (`missing-title`, `missing-description`,
`duplicate-title`, `broken-internal-link`): those were wrong the day they
shipped. A missing TL;DR on a three-year-old post is an opportunity, not a
defect.

---

## Invariants

Three rules the skill enforces on the agent, ported from blogEO:

1. Always run `node scripts/state.mjs validate` after editing any state file.
2. Never publish or mark done an article that fails `node scripts/gate.mjs` —
   max 2 redrafts, then stop and mark the calendar entry `failed`.
3. Never fabricate source URLs — cite only URLs actually fetched this session.
