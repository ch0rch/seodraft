# /seodraft init — onboard a content repo

Creates `.seodraft/` in the client repo: `config.json`, `profile.md`, empty
`keywords.json` and `calendar.json`, and a gitignore entry for
`config.local.json`. Run once per repo; re-running updates in place after
confirming with the user.

All scripts run from the repo root.

---

## 1. Detect the framework

```
node scripts/detect.mjs
```

Output:

```json
{
  "framework": "astro",
  "contentDirCandidates": ["src/content/blog"],
  "extension": ".mdx",
  "sampleFrontmatterKeys": { "src/content/blog": ["title", "description", "pubDate", "heroImage", "tags"] }
}
```

- `framework` is one of `astro | next | hugo | jekyll | unknown`.
- `contentDirCandidates` are directories that look like post collections,
  best first.
- `extension` is the dominant extension among existing posts (`.md`, `.mdx`,
  or `.mdoc` for Keystatic/Markdoc repos). The scanners always read
  `.md`/`.mdx` and additionally whatever `extension` the config declares.
- `sampleFrontmatterKeys` maps each candidate dir to the frontmatter keys
  found in up to 5 existing posts — this is your evidence for the mapping in
  step 2.
- `schemaFiles` lists explicit content-schema files found in the repo
  (`keystatic.config.*`, `src/content/config.*`, `contentlayer.config.*`).
  **When this is non-empty, read those files — they outrank the samples.**
  A field that is absent whenever it holds its default (a Keystatic
  `fields.checkbox`, an optional Zod field) appears in NO published post, so
  sampling alone maps it to `null` and the gate can never enforce it.

`{"framework":"unknown","contentDirCandidates":[]}` means detection found
nothing. Do not guess: ask the user for the framework and the content
directory, and continue with their answers.

## 2. Confirm contentDir and the frontmatter mapping

Present the detected candidate and the sampled keys, then confirm:

- **contentDir** — one candidate: confirm it. Multiple: ask which. None: ask.
- **frontmatter mapping** — map each of the **nine canonical fields**
  (`title`, `description`, `date`, `updatedDate`, `image`, `tags`, `draft`,
  `tldr`, `faqs`) to the client's actual key, using `sampleFrontmatterKeys`
  as evidence. All nine keys go into the config object; a canonical field
  with no counterpart in the client's repo maps to `null` — unused, and
  every rule that reads it is skipped. Show the proposed mapping and let the
  user correct it before writing.
- **the three AEO fields** — `updatedDate`, `tldr`, `faqs`. `updatedDate` is
  the freshness signal (sites feed it to `dateModified` in their JSON-LD);
  `tldr` and `faqs` are the parts answer engines actually quote. These three
  are the ones most likely to exist in the repo's **explicit schema while
  appearing in none of the sampled posts**: they are optional, so posts that
  omit them are still valid and sampling sees nothing. That is what the
  `schemaFiles` guidance in step 1 is for — read `keystatic.config.*`,
  `src/content/config.*`, `contentlayer.config.*` before concluding one of
  these is absent. Mapping an AEO field to `null` silently disables its gate
  and audit rules, so a wrong `null` here is why those rules would never
  fire.
- Mapped values may be **dot-paths into nested frontmatter**: a Keystatic
  repo whose meta lives under `seo:` maps
  `"title": "seo.seoTitle", "description": "seo.seoDescription"`. Prefer the
  field the site actually renders into `<title>`/`<meta name="description">`
  (check the blog's page template) over the human-facing heading field.

Why this matters: the gate checks `frontmatter-complete` against every
non-null mapped field, and the write pipeline emits exactly these keys. A
wrong mapping either blocks every article or writes frontmatter the site
ignores.

## 3. Build the business profile

Interview the user for:

| field | limit |
| --- | --- |
| business description | free text |
| target audiences | max 7 |
| competitors | max 7 |
| brand voice | free text |
| global writing instructions | free text |

**Offer autocomplete first.** If the user gives (or config will hold) a
`siteUrl`, offer to fetch it with your own web/fetch tool and extract a draft
profile, then let the user correct it. Frame the extraction as:

> You are helping a business owner fill out an onboarding form from their
> website content. Read the following extracted website text and produce a
> short business description, up to 7 target audiences, and up to 7 likely
> competitors.

The output is a description, ≤7 audiences, ≤7 competitors — a draft the user
edits, never a silent final answer. No web tool available: skip autocomplete
and interview directly.

## 4. Write `config.json`

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

Field notes:

- `siteUrl`, `language` — ask the user; `language` is the language articles
  are written in. `locationCode` is the DataForSEO location (2840 = US); ask
  only if the user's market is not obvious from the conversation.
- `framework`, `contentDir`, `extension`, `frontmatter` — from steps 1–2.
  All nine `frontmatter` keys must be present, `null` included.
- `bodyH1` — `false` when the site layout renders the title (the common
  case; article bodies must then contain zero H1s), `true` when the body
  must open with its own H1. Check an existing post to decide.
- `internalLinksMin`, `thinContentWords`, `titleMax`, `descriptionMax` —
  keep the defaults shown above unless the user asks otherwise.
- `tldrMin`, `tldrMax` — the allowed TL;DR length in characters (defaults
  `100` and `400`). Below `tldrMin` it is not a self-contained answer; above
  `tldrMax` it is a summary no engine will quote whole.
- `faqsMin` — minimum number of FAQ entries when `faqs` is mapped (default
  `3`).
- `faqAnswerMax` — maximum characters in a single FAQ answer (default
  `500`), keeping each answer short enough to be lifted verbatim.

These four AEO thresholds only matter when `tldr`/`faqs` are mapped; keep the
defaults unless the site already has a house style that contradicts them.

## 5. Write `profile.md`

Committed Markdown with the interview results, one section each: Business,
Audiences (list, ≤7), Competitors (list, ≤7), Voice, Global instructions.
The write pipeline quotes Voice and Global instructions into its prompts, so
write them as instructions, not as marketing copy.

## 6. Seed the remaining state

Write empty banks:

```json
{ "schemaVersion": 1, "keywords": [] }
```

```json
{ "schemaVersion": 1, "entries": [] }
```

to `.seodraft/keywords.json` and `.seodraft/calendar.json`.

## 7. Gitignore block

Append to `.gitignore` (create it if absent), exactly once — skip if the
markers already exist:

```
# seodraft-ignore-start
.seodraft/config.local.json
# seodraft-ignore-end
```

`config.local.json` holds DataForSEO credentials
(`{"dataforseo": {"login": "...", "password": "..."}}`) and must never be
committed. Do not create the file yourself; tell the user it is optional and
where credentials go (env vars `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` also
work and take precedence). Without credentials, keyword commands run in
degraded mode with estimated metrics — that is supported, not an error.

## 8. Validate

```
node scripts/state.mjs validate
```

Must print `{"ok":true}`. `{"ok":false,"errors":[...]}` (exit 1) lists what
to fix in which file — fix and re-run before declaring init done.

Finish by telling the user init is complete and the natural next step is
`/seodraft keywords`.
