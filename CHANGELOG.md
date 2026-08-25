# Changelog

Notable changes per release. Versions follow [semver](https://semver.org): for
this package the public surface is the CLI commands, the `.seodraft/` state
schemas, and the set of gate and audit rule names — renaming a rule or making
an advisory into an error is a breaking change, because someone's CI depends on
the exit code.

## 0.1.0 — unreleased

First release. Everything below is new.

### The engine

- **Agent skill** with six commands — `init`, `keywords`, `plan`, `write`,
  `audit`, `status` — one reference procedure per command.
- **Installer** (`seodraft install|update`) that detects Claude Code, Codex,
  Cursor, Gemini CLI and OpenCode harness folders and copies the skill in,
  at project or global scope.
- **Pre-publish gate**: 15 rules, 12 blocking. `cannibalization` is a hard stop
  and never a redraft — a second post on a term you already cover splits your
  own ranking.
- **Content audit**: 18 rules over existing content, always exit 0, because
  the findings are the output rather than a failure.
- **Framework detection** for Astro, Next.js, Hugo and Jekyll, including
  Markdoc/Keystatic `.mdoc`, driven by the content schema when the framework
  declares one.
- **AEO fields** as first-class: `tldr`, `faqs`, `updatedDate`. The same rules
  are errors in the gate and advisories in the audit — new content has no
  excuse, a legacy archive is an opportunity list.
- **Nine-field frontmatter mapping** with dot-paths into nested frontmatter;
  `null` marks a field unused and disables its rules.
- **Optional keyword metrics** via DataForSEO. Without credentials the script
  exits 0 reporting `{"degraded": true}` and metrics are marked
  `source: "estimate"`; a measurement always beats an estimate and never the
  other way round.
- **Headless use**: `gate`, `audit`, `keywords` and `state` run from CI with no
  harness installed.

### Guarantees

- Zero runtime dependencies. Everything under `skill/scripts/` imports only
  `node:` builtins, enforced mechanically by `scripts/check-no-runtime-deps.mjs`.
- Node >= 18, tested on 18, 22 and 24.
- 75 tests across 9 suites.
