# Changelog

Notable changes per release. Versions follow [semver](https://semver.org): for
this package the public surface is the CLI commands, the `.seodraft/` state
schemas, and the set of gate and audit rule names — renaming a rule or making
an advisory into an error is a breaking change, because someone's CI depends on
the exit code.

## 0.2.0 — 2026-08-31

Pi support. Nothing changes for the harnesses already supported: the skill
payload the installer copies is byte-identical to 0.1.0.

### Added

- **Native Pi package.** `pi install npm:seodraft` registers the skill from a
  `pi` manifest in `package.json`. Pi loads it in place, so nothing is copied
  into your repo and `pi update` keeps it current. Install without a version:
  a pinned spec is deliberately skipped by `pi update --extensions`.
- **`/seodraft <command>` prompt template** (`prompts/seodraft.md`), so Pi
  keeps the same invocation as every other harness instead of only
  `/skill:seodraft`. It uses `$1` and `${@:2}` and nothing else — released Pi
  builds do not substitute bash-style defaults like `${1:-status}` and leak the
  raw token into the prompt.
- **`pi` installer provider** (`.pi/skills/`), for parity with
  `--providers=claude,codex,cursor,gemini,opencode`. Use the package **or**
  this, not both: Pi reports a name collision and loads whichever it finds
  first. A `.agents/skills/` install from Codex is already visible to Pi.

### Guarantees

- A test asserts every provider receives an identical payload, and that
  `prompts/` — a package-root resource — never leaks into the copied skill.
- The tarball smoke test now fails if any `pi` manifest root is missing from
  the published `files`, which would make Pi load an empty package.
- 81 tests across 10 suites.

## 0.1.0 — 2026-08-25

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
- This one version carries **no provenance attestation**, only the registry
  signature: npm will not let you configure a trusted publisher for a package
  that does not exist, so 0.1.0 had to be published by hand. Every release from
  0.1.1 on is published by CI over OIDC and is verifiable against the commit
  that produced it.
