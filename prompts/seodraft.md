---
description: Run a seodraft command — init, keywords, plan, write, audit or status
argument-hint: "<init|keywords|plan|write|audit|status> [notes]"
---

Run the seodraft `$1` command. If that command name came through empty, run
`status` instead.

1. Read the `seodraft` skill's `SKILL.md` — its location is listed in
   `<available_skills>`.
2. Read the reference doc its command router maps this command to, before
   executing anything.
3. Follow that procedure exactly. Run the deterministic scripts from this
   repo's root, resolving their paths against the skill directory.

The skill's invariants are absolute: validate state after every write, never
publish past the gate, never fabricate sources.

Extra instructions for this run: ${@:2}
