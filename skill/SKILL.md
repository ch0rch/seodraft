---
name: seodraft
description: >-
  Local-first SEO/AEO content engine. Use when the user asks about SEO content,
  blog articles, keywords, keyword research, a content calendar, planning or
  writing posts, or wants to audit blog content. Handles /seodraft init,
  keywords, plan, write, audit, and status.
---

# Seodraft

You run an SEO content operation inside this repo. You propose (keywords,
plans, drafts); deterministic scripts gate; the human approves. All state
lives in `.seodraft/` and all articles are Markdown/MDX files in the
configured content directory — nothing leaves the repo.

Scripts live under `scripts/` next to this file. **Always run them from the
client repo root** (they read `.seodraft/config.json` from cwd) and pass the
path relative to this skill, e.g. `node <skill-dir>/scripts/state.mjs validate`.
Every script prints a single JSON object to stdout.

## Command router

| command | do this | full procedure |
| --- | --- | --- |
| `/seodraft init` | detect framework, interview, write config + profile | [reference/init.md](reference/init.md) |
| `/seodraft keywords` | generate / add / suggest keywords with real or estimated metrics | [reference/keywords.md](reference/keywords.md) |
| `/seodraft plan` | schedule keywords into the content calendar | [reference/plan.md](reference/plan.md) |
| `/seodraft write` | research → outline → draft → gate an article | [reference/write.md](reference/write.md) |
| `/seodraft audit` | deterministic audit of existing content, fixes on approval | [reference/audit.md](reference/audit.md) |
| `/seodraft status` | report queue, coverage, audit counts | [reference/status.md](reference/status.md) |

Read the reference doc before executing a command. If no `.seodraft/config.json`
exists, every command except `init` stops and points the user at
`/seodraft init`.

## State files

| file | committed | holds |
| --- | --- | --- |
| `.seodraft/config.json` | yes | site, framework, contentDir, nine-field frontmatter mapping, gate thresholds |
| `.seodraft/profile.md` | yes | business, audiences, competitors, voice, global instructions |
| `.seodraft/keywords.json` | yes | keyword bank: term, volume, difficulty, type, source, status |
| `.seodraft/calendar.json` | yes | scheduled entries: term, date, customInstructions, status |
| `.seodraft/config.local.json` | no (gitignored) | DataForSEO credentials |

You edit the JSON state files directly with your file tools. Schemas are
enforced by `scripts/state.mjs`; the reference docs show every field.

The `frontmatter` mapping covers nine canonical fields: `title`,
`description`, `date`, `updatedDate`, `image`, `tags`, `draft`, `tldr`,
`faqs`. The last three are the AEO fields — `updatedDate` is the freshness
signal sites feed to `dateModified`, `tldr` and `faqs` are what answer
engines quote. A field mapped to `null` is unused in this repo and its rules
are skipped; a mapped field is enforced. So: fill `tldr` and `faqs` when you
write, and bump `updatedDate` to today whenever you change a published
post's content.

## Scripts

| script | purpose | exit |
| --- | --- | --- |
| `scripts/state.mjs validate` | validate all four state files | 1 on invalid |
| `scripts/detect.mjs` | framework + content-dir detection | 0 |
| `scripts/linkgraph.mjs inventory` | post inventory + internal-link graph | 0 |
| `scripts/gate.mjs <file> --term "<term>"` | pre-publish gate on one article | 1 on any error-severity failure |
| `scripts/audit.mjs [--file <path>]` | audit existing content | always 0 |
| `scripts/dataforseo.mjs volume\|suggest` | keyword metrics; degraded mode on missing credentials | 0 even when degraded |

## Invariants

These are absolute. No command overrides them.

1. **Validate after every state write.** After editing any `.seodraft/*.json`
   file, run `node scripts/state.mjs validate`. `{"ok":false}` means you fix
   the file before doing anything else.
2. **Never publish past the gate.** An article that fails
   `node scripts/gate.mjs` is never marked done. Fix and re-gate at most
   twice; after 2 redrafts, mark the calendar entry `failed` with a
   `failedReason` and stop. A `cannibalization` failure is a hard stop —
   never rephrase the term to sneak past it.
3. **Never fabricate sources.** Cite only URLs you actually fetched this
   session. No web tool available means an article with zero external
   citations, not invented ones.
