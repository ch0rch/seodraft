# /seodraft plan — schedule the calendar

Moves stored keywords into `.seodraft/calendar.json` as scheduled entries.
Requires keywords in the bank (`/seodraft keywords` first).

---

## The calendar

```json
{ "schemaVersion": 1, "entries": [ {
  "term": "string", "scheduledDate": "YYYY-MM-DD", "customInstructions": "",
  "status": "scheduled|writing|done|failed", "articlePath": null, "failedReason": null } ] }
```

- `term` must exist in `keywords.json` (normalized form).
- New entries start as `status: "scheduled"` with `articlePath: null` and
  `failedReason: null`. Only `/seodraft write` moves an entry to `writing`,
  `done`, or `failed`.
- `customInstructions` is per-entry guidance for the write step ("compare
  against X", "include our pricing", "target beginners") — default `""`.

## Flow

1. Read `keywords.json` and `calendar.json`.
2. Determine which terms to schedule:
   - The user named terms → those.
   - The user said "plan the next N" or similar → pick the N best unscheduled
     `stored` keywords, preferring higher `volume` and lower `difficulty`;
     among estimates, use your judgment and say so.
3. **Refusals** — check before writing, per term:
   - `status: "written"` in the bank → refuse: it already has an article.
     Point at its `articlePath`. Do not schedule a rewrite unless the user
     explicitly asks for a new distinct term.
   - Already in the calendar with status `scheduled` or `writing` → refuse
     the duplicate; offer to reschedule the existing entry instead.
   - Not in the bank at all → offer to add it first via
     `/seodraft keywords add`, then schedule.
4. Assign dates:
   - Explicit date(s) from the user → use them (`YYYY-MM-DD`).
   - "Next N slots" → fill forward from the day after the latest scheduled
     entry (or tomorrow if the calendar is empty), one per slot. Default
     cadence is weekly; ask if the user has not stated one.
5. Ask for or accept `customInstructions` per entry when the user has
   specific angles; otherwise leave `""`.
6. Write the entries into `calendar.json` and flip each scheduled keyword's
   `status` in `keywords.json` from `stored` to `planned`.
7. Validate:
   ```
   node scripts/state.mjs validate
   ```
   Must print `{"ok":true}` — both files changed, both are checked.

## Finish

Report the schedule back as a short table (term, date, instructions) and note
that `/seodraft write` executes the next entry.
