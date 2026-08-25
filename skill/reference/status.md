# /seodraft status — where the operation stands

Read-only. Reads the state files, reports the queue and coverage, runs
nothing that writes.

---

## 1. Read

- `.seodraft/config.json` — exists? If not, report "not initialized" and
  point at `/seodraft init`; stop.
- `.seodraft/keywords.json`
- `.seodraft/calendar.json`

Optionally run `node scripts/state.mjs validate` first; `{"ok":false}` means
the state itself is broken — report the errors as the headline instead of a
normal status.

## 2. Report

**Queue** — calendar entries by status:

- `scheduled`: term + `scheduledDate`, soonest first. Flag past-due dates.
- `writing`: in-flight (usually an interrupted run — offer to resume with
  `/seodraft write`).
- `failed`: term + `failedReason` — these need a human decision, surface
  them prominently.
- `done`: count, with the most recent few `articlePath`s.

**Coverage** — keyword bank totals:

- counts by `status`: `stored` / `planned` / `written`;
- how many entries are estimates (`source: "estimate"`) — worth re-running
  `/seodraft keywords` once DataForSEO credentials exist;
- total terms.

**AEO coverage** — only when `tldr` and/or `faqs` are mapped in
`config.json` (mapped to `null` means not applicable here: say nothing).
Report how many posts have a TL;DR and how many carry at least `faqsMin`
FAQs, as total posts minus the gaps: post count from
`node scripts/linkgraph.mjs inventory` (read-only), gaps from the last
audit's `missing-tldr` / `missing-faqs` advisories. No audit this session →
report AEO coverage as unknown and offer `/seodraft audit`; never scan the
content directory yourself to synthesize it.

**Last audit** — if an audit ran earlier in this conversation, repeat its
finding counts per rule (errors vs advisories). If none ran this session, say
so and offer `/seodraft audit`; do not re-run it silently — an audit on a
large repo is not free, and status must stay read-only.

## 3. Suggest the next step

End with the single most useful next command given the state: empty bank →
`/seodraft keywords`; stored-but-unplanned terms → `/seodraft plan`;
scheduled entries due → `/seodraft write`; failures present → discuss the
`failedReason`s.
