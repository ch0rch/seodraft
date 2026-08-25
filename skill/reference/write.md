# /seodraft write — the article pipeline

Produces one gated article for one calendar entry:
linkgraph → research → outline → body → meta → file → gate → state updates.
You are the writer; the gate is deterministic code; the pipeline stops the
moment the gate says stop.

Inputs read before writing a word:

- `.seodraft/config.json` — `language`, `contentDir`, `extension`,
  `frontmatter` mapping, `bodyH1`, `internalLinksMin`, `titleMax`,
  `descriptionMax`, `tldrMin`, `tldrMax`, `faqsMin`, `faqAnswerMax`.
- `.seodraft/profile.md` — business context, voice, global instructions.
- The calendar entry — `term`, `customInstructions`.

Pick the entry: the user named a term → that entry; otherwise the earliest
`scheduled` entry. If the term is not scheduled, offer `/seodraft plan`
first. Set the entry's `status` to `"writing"` before starting (and
validate), so an interrupted run is visible.

---

## 1. Internal links first

```
node scripts/linkgraph.mjs inventory
```

Output:

```json
{ "posts": [ {
  "path": "src/content/blog/example.mdx", "slug": "example",
  "title": "...", "description": "...",
  "headings": [ { "level": 2, "text": "..." } ],
  "outboundInternal": ["other-slug"], "brokenInternal": [], "wordCount": 1240 } ] }
```

From `posts`, pick **at least `internalLinksMin`** targets topically relevant
to the term — judged by `title`, `description`, and `headings`, not by slug
similarity. These get woven into the body in step 3 as links to `/<slug>` (or
the site's post URL shape, visible in existing posts' internal links). Doing
this first means links are planned content, not decoration bolted on to pass
the gate. If the repo has fewer posts than `internalLinksMin`, tell the user
now: the gate will fail and the fix is lowering the config value or writing
more posts — not fake links.

## 2. Research

Use your web-search/fetch tool if you have one. Frame the research as:

> Research the topic "<term>" for an SEO article by <businessName>
> (<country>, language: <language>). Business context: <description>.
> Custom instructions: <customInstructions>. Return a concise topic summary
> and a list of citable external sources.

(`businessName`/`description` come from `profile.md`; omit the context and
custom-instruction lines when empty.) Keep the summary and the list of URLs
you actually fetched.

**No web tool → no citations.** Write from knowledge and cite zero external
URLs. Never invent a source; a fabricated citation is worse than none.

## 3. Outline → body

**Outline.** Produce an H2/H3 outline:

> Create an H2/H3 outline for an SEO article about "<term>" in the style
> "<style>". Research summary: <summary>. Global instructions: <gi>.

`<style>` is the voice from `profile.md`; `<gi>` its global instructions.
The outline is sections `{heading, subheadings[]}` — respect
`heading-structure`: at least 2 H2s, H3s only under an H2, never skip a
level.

**Body.** Write the full body following the outline:

> Write the full body of an SEO article about "<term>" following this
> outline:
> - <heading>: <subheadings joined by ", ">
> - ...
> Do not use emojis. Custom instructions: <ci>.

One outline line per section. While writing:

- Write in the configured `language`, in the `profile.md` voice, honoring
  its global instructions and the entry's `customInstructions`.
- Weave in the internal links chosen in step 1 — at least
  `internalLinksMin`, each resolving to a real slug.
- Cite only URLs fetched in step 2.
- H1s: exactly one when `bodyH1: true`, **zero** when `false` (the layout
  renders the title). Section headings are H2/H3.
- Every image gets alt text. No `TODO`, no placeholder text.

**Answer-first structure (AEO).** Answer engines quote *sections*, not whole
articles, so write every section to survive being extracted on its own:

- Answer the heading's question in the **first sentence** of the section.
  Everything after it is elaboration, never build-up to the answer.
- Keep each section self-contained enough to be lifted without the
  surrounding context: no "as we saw above", no pronoun pointing back at a
  previous heading.
- Phrase headings as the question a reader would actually type, where that
  reads naturally — not as a bare keyword label, and not forced into a
  question when the section answers none.

## 4. Title, slug, meta

> Write a final SEO title, URL slug, and meta description (max 160
> characters) for this article about "<term>". <article sections>

Then enforce deterministically — the model does not always honor caps:

- **Title** ≤ `titleMax` chars and ≥ 15. Too long → rewrite shorter, don't
  hard-truncate a title.
- **Description** ≤ `descriptionMax`: truncate defensively to
  `descriptionMax` yourself, cutting at a word boundary. Must be ≥ 50 chars.
- **Slug** — apply the slug rule regardless of what the model proposed:
  lowercase → replace every run of `[^a-z0-9]+` with `-` → strip leading and
  trailing `-`.

## 5. Write the file

Path: `<contentDir>/<slug><extension>`.

Frontmatter uses the config `frontmatter` mapping — emit the client's key
for each canonical field; a canonical field mapped to `null` is **omitted
entirely**:

| canonical | value |
| --- | --- |
| `title` | the final title |
| `description` | the final meta description |
| `date` | today, in the format existing posts use |
| `updatedDate` | when mapped, today, same format as `date` — a new article was published and last updated today. This is what the site feeds to `dateModified` and what `stale-post` reads on later audits |
| `image` | when mapped (non-null), the gate requires it non-empty: use a user-supplied image, or reuse the site's existing image convention (e.g. a default hero); if the site has none, tell the user to either provide one or map `image: null` in config (no image generation in v1) |
| `tags` | 2–5 relevant tags, matching existing posts' tag style |
| `draft` | `true` — when mapped, new articles always land as drafts |
| `tldr` | when mapped, a self-contained answer to the target term, `tldrMin`–`tldrMax` chars. Not a teaser: a reader who sees only the TL;DR must have their question answered |
| `faqs` | when mapped, at least `faqsMin` question/answer pairs in the shape existing posts use; each answer ≤ `faqAnswerMax` chars and answers its own question in the first sentence |

Body: the step-3 body, with the H1 policy already applied.

## 6. Gate, redrafts, state

```
node scripts/gate.mjs <file> --term "<term>"
```

Output `{"ok", "failures", "advisories"}`, items
`{"rule","file","message","severity"}`; exit 1 on any error-severity
failure.

The AEO rules can fail here too:

| rule | severity | fix |
| --- | --- | --- |
| `tldr-length` | error | TL;DR outside `tldrMin`–`tldrMax` chars — rewrite it to length, never pad it to clear the floor |
| `faqs-min` | error | fewer than `faqsMin` entries — add questions readers actually ask, not restatements of your headings |
| `faq-answer-length` | advisory | an answer over `faqAnswerMax` chars — cut it back to the answer |

A `frontmatter-complete` failure naming the `tldr` or `faqs` key means the
field is mapped but you left it out or empty. Fill it; never "fix" it by
unmapping the field in config.

**On failure:** read each failure's `rule` and `message`, fix the file, and
re-run the gate. **Maximum 2 redrafts.** Still failing after the second →
set the calendar entry to `status: "failed"` with `failedReason` naming the
failing rules, validate state, report to the user, and stop. Do not keep
polishing past the budget.

**`cannibalization` is a hard stop, not a redraft.** It means an article for
this term already exists. Never rephrase the term or tweak the title to get
past it — mark the entry `failed` with that reason immediately and tell the
user, pointing at the existing article.

Advisories (`thin-content`, `cannibalization-fuzzy`, `faq-answer-length`) do
not block; surface them to the user with the result.

**On pass:**

1. Calendar entry → `status: "done"`, `articlePath` = the file path.
2. Keyword entry (matching normalized term) → `status: "written"`,
   `articlePath` = the same path.
3. ```
   node scripts/state.mjs validate
   ```
   Must print `{"ok":true}`.

Finish with a short report: the file path, title, word count, internal links
used, external sources cited (if any), and any advisories.
