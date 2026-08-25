# seodraft

**Outrank for your repo, powered by the agent you already pay for.**

A local-first SEO/AEO content engine. It installs an agent skill plus a set of
dependency-free Node scripts into the AI coding harness you already run, and
turns it into a content operation: keyword research, a content calendar, article
generation, and a deterministic pre-publish gate.

No SaaS. No model API keys. Your articles are Markdown files in your repo and
your state is JSON files you can read in a diff.

---

## How it works

The division of labor is the whole design:

| | |
| --- | --- |
| **Your agent** proposes | keywords, schedules, research, drafts, fix suggestions |
| **Deterministic code** decides | 15 gate rules, 18 audit rules — no LLM, no network, milliseconds |
| **You** approve | nothing is published or edited without you |

A reviewer gets tired; a gate does not. Every question with a factual answer
(is the meta description within budget, does this internal link resolve, is
this term already covered by another post) is answered by a script on every
article, forever. Everything that needs taste stays with you and your agent.

## Requirements

- Node.js ≥ 18
- A Markdown/MDX content repo — Astro, Next.js, Hugo and Jekyll are detected
  automatically, and Markdoc/Keystatic (`.mdoc`) works too
- One of: Claude Code, Codex, Cursor, Gemini CLI, OpenCode

## Install

Not published to npm yet. Install from source:

```bash
git clone https://github.com/ch0rch/seodraft.git
cd seodraft && pnpm install

# then, from your content repo:
node /path/to/seodraft/bin/seodraft.mjs install
```

`install` detects which harness folders exist (`.claude`, `.agents`, `.cursor`,
`.gemini`, `.opencode`), asks you to confirm, and copies the skill in. Pass
`--providers=claude,cursor` to skip the prompt, or `--scope=global` to install
into `~` instead of the project. `update` re-copies over an existing install.

Then open your agent in your content repo and run `/seodraft init`.

## Commands

Inside your agent:

| command | what it does |
| --- | --- |
| `/seodraft init` | detects your framework, interviews you about the business, writes `.seodraft/config.json` + `profile.md` |
| `/seodraft keywords` | builds the keyword bank — real metrics via DataForSEO, or clearly-marked estimates without it |
| `/seodraft plan` | schedules stored keywords into a content calendar |
| `/seodraft write` | research → outline → draft → gate, then updates state. Max 2 redrafts, then it stops |
| `/seodraft audit` | deterministic audit of existing content, with fixes applied only after you approve |
| `/seodraft status` | queue, keyword coverage, AEO coverage, last audit counts |

The same scripts run headless for CI, no harness required:

```bash
seodraft gate content/blog/my-post.mdx --term "target keyword"   # exit 1 on failure
seodraft audit --file content/blog/my-post.mdx                   # always exit 0
seodraft state validate
```

## The gate

`gate.mjs` blocks an article on any error-severity failure. It is the reason a
bad draft never becomes a file you have to clean up later.

| rule | severity |
| --- | --- |
| `frontmatter-parse`, `frontmatter-complete` | error |
| `title-length`, `description-length` | error |
| `h1-policy`, `heading-structure` | error |
| `internal-links-min`, `broken-internal-link` | error |
| `cannibalization` | error |
| `placeholder-text` | error |
| `tldr-length`, `faqs-min` | error |
| `cannibalization-fuzzy`, `thin-content`, `faq-answer-length` | advisory |

`cannibalization` is a hard stop, never a redraft: if a term is already covered
by one of your posts, a second post splits your own ranking. The agent is
forbidden from rephrasing around it.

## AEO

Three canonical fields exist because answer engines quote structure, not prose:

- **`tldr`** — a self-contained answer to the target term. This is the block an
  answer engine lifts.
- **`faqs`** — quotable question/answer pairs.
- **`updatedDate`** — the freshness signal. It feeds `dateModified` in your
  structured data; without it, a post you refreshed can never say so.

**The same AEO rules are errors in the gate and advisories in the audit.** That
split is deliberate. New content has no excuse for missing fields your own
schema declares. But erroring every post in a legacy archive that predates the
standard produces noise, not signal, and buries the findings that matter. A
missing TL;DR on a three-year-old post is an opportunity; a missing meta
description was always a defect.

## Configuration

`.seodraft/config.json` (committed) maps nine canonical fields onto whatever
your repo actually calls them. Values may be dot-paths into nested frontmatter,
and `null` means the field is unused here — which also disables its rules.

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
    "title": "seo.seoTitle",
    "description": "seo.seoDescription",
    "date": "publishedDate",
    "updatedDate": "updatedDate",
    "image": "coverImage",
    "tags": "category",
    "draft": "draft",
    "tldr": "seo.tldr",
    "faqs": "faqs"
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

State files, all in `.seodraft/`:

| file | committed | holds |
| --- | --- | --- |
| `config.json` | yes | the above |
| `profile.md` | yes | business, audiences, competitors, voice, instructions |
| `keywords.json` | yes | the keyword bank |
| `calendar.json` | yes | scheduled entries |
| `config.local.json` | **no** | DataForSEO credentials |

## Keyword metrics are optional

DataForSEO gives you real search volume and difficulty. Without credentials,
`dataforseo.mjs` exits **0** with `{"degraded": true, "reason":
"missing-credentials"}`, and the agent estimates the metrics instead, marking
those entries `source: "estimate"`. Real measurements always overwrite an
estimate; an estimate never overwrites a measurement.

Credentials go in `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` or in the
gitignored `.seodraft/config.local.json`.

## Development

```bash
pnpm install
pnpm test        # 75 tests, 9 suites
```

Everything under `skill/scripts/` is dependency-free Node ≥ 18 ESM (`node:fs`,
`node:path`, global `fetch`) so it runs inside any harness with no install step.
`fixtures/astro-blog/` is a content repo seeded with a known set of defects that
the gate and audit tests assert against exactly.

## Not in v1

Google Search Console OAuth and opportunity scoring, AI-citation *tracking*
(v1 enforces citable structure; it does not measure citations), WordPress
publishing, and image generation.

## License

Apache-2.0
