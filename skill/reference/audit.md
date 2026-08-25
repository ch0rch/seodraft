# /seodraft audit — audit existing content

Deterministic audit of the whole content directory (or one file). Findings
come from code, fixes come from you, application comes only after the user
approves. No search-console data in v1 — every rule is computable from the
repo alone.

---

## 1. Run the audit

```
node scripts/audit.mjs
```

or one file:

```
node scripts/audit.mjs --file src/content/blog/example.mdx
```

Output — same shape as the gate:

```json
{ "ok": false,
  "failures": [ { "rule": "missing-description", "file": "src/content/blog/a.mdx",
                  "message": "...", "severity": "error" } ],
  "advisories": [ { "rule": "orphan-page", "file": "src/content/blog/b.mdx",
                    "message": "...", "severity": "advisory" } ] }
```

**Always exits 0** — findings are the product, not an error condition. A
nonzero exit means the script itself broke, not that the content is bad.

## 2. The rules

| rule | severity | meaning |
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
| `stale-post` | advisory | mapped `updatedDate` older than 12 months — falling back to `date` when `updatedDate` is unmapped |
| `missing-updated-date` | advisory | `updatedDate` mapped but absent — `dateModified` falls back to the published date, so a refresh never registers |
| `missing-tldr` | advisory | `tldr` mapped but absent or empty |
| `missing-faqs` | advisory | `faqs` mapped but absent or empty |
| `tldr-length` | advisory | TL;DR outside `tldrMin`–`tldrMax` chars |
| `faq-answer-length` | advisory | an FAQ answer over `faqAnswerMax` chars |

An `unparseable-frontmatter` finding means the file's frontmatter uses YAML
beyond the supported subset. The parser handles scalars, quoted strings,
numbers, booleans, dates, inline and block sequences, nested maps, sequences
of maps, and block scalars (`|`, `>`); it rejects anchors/aliases, flow maps
(`{a: 1}`) and tab indentation. That is a finding to show the user, not a
crash — ask them to simplify the frontmatter or map fields manually.

### Why the AEO rules are advisories here but gate errors

`tldr-length` and `faqs-min` are **errors** in `/seodraft write`'s gate and
the AEO rules are **advisories** here. That split is deliberate: new content
is where the standard gets enforced, so an article written today has no
excuse for skipping fields the site's own schema declares. An existing
archive predates the standard — erroring a hundred old posts for a missing
TL;DR produces noise that buries the findings that matter. Unambiguous
defects stay errors in the audit (`missing-title`, `missing-description`,
`duplicate-title`, `broken-internal-link`): those were wrong the day they
shipped. A missing TL;DR on a three-year-old post is an opportunity, not a
defect — report it that way.

`stale-post` now reads `updatedDate` first, falling back to `date` only when
`updatedDate` is unmapped. A post published in 2023 and refreshed last month
is not stale, and flagging it as stale in an audit whose purpose is to drive
refreshes is exactly the wrong signal.

## 3. Report

Group findings **by rule**, not by file: ten broken links are one problem
with ten instances. For each rule, list the files and messages, and lead with
error-severity rules. Keep the counts honest — the same counts `/seodraft
status` will later report.

## 4. Propose fixes

For each finding you can fix concretely, propose a per-file fix **as a
diff** the user can read before anything changes:

- `missing-title` / `title-length` / `duplicate-title` → a rewritten title
  within 15–`titleMax` chars, distinct across posts.
- `missing-description` / `description-length` / `duplicate-description` →
  a rewritten description within 50–`descriptionMax` chars.
- `broken-internal-link` → the nearest real slug (use
  `node scripts/linkgraph.mjs inventory` to see what exists), or removing
  the link when nothing matches.
- `missing-alt-text` → descriptive alt text from the surrounding content.
- `heading-skip` → the corrected heading level.
- `orphan-page` → suggest which existing posts should link to it (these are
  edits to *other* files — say so).
- `thin-content` / `stale-post` → flag for the user; expanding or refreshing
  a post is a `/seodraft write`-scale job, not an audit patch.
- `missing-tldr` / `tldr-length` → a TL;DR answering the post's target term
  in `tldrMin`–`tldrMax` chars, self-contained, never a teaser.
- `missing-faqs` → at least `faqsMin` question/answer pairs drawn from the
  post's own content, in the shape existing posts use.
- `faq-answer-length` → the same answer, tightened to ≤ `faqAnswerMax` chars.

## 5. Apply only on approval

Apply **nothing** until the user approves in this conversation — per fix or
as an approved batch. Then:

1. Edit exactly the approved files.
2. **Bump `updatedDate` to today on every file whose content you changed**
   (when `updatedDate` is mapped). This is the freshness signal doing its
   job: the site's structured data feeds it to `dateModified`, and the next
   audit reads it for `stale-post`. A fix that silently leaves `updatedDate`
   untouched tells both Google and the next audit that nothing happened.
   Metadata-only fixes count — the post changed.
3. Re-run on each touched file:
   ```
   node scripts/audit.mjs --file <path>
   ```
   and confirm the addressed findings are gone (and no new ones appeared).
4. Report before/after counts.

The audit never touches `.seodraft/` state, so no `state.mjs validate` is
needed unless you edited state for some other reason.
