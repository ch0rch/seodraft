# Contributing to seodraft

Thanks for wanting to help. This document is short on ceremony and long on the
two or three constraints that are easy to break by accident.

## Getting set up

```bash
git clone https://github.com/ch0rch/seodraft.git
cd seodraft
pnpm install     # vitest is the only dependency, and it is dev-only
pnpm test        # 75 tests, 9 suites, runs in under a second
```

There is no build step. `skill/` is the product; the installer copies it.

## The one hard rule

**Everything under `skill/scripts/` must stay dependency-free.**

Those scripts run inside someone else's AI harness, invoked as
`node scripts/gate.mjs ...`, with no install step and no `node_modules`. They
may use `node:fs`, `node:path`, other `node:` builtins and global `fetch`.
Nothing else. Not a YAML parser, not a Markdown parser, not a glob library.

This is why the frontmatter parser and the Markdown scanner are hand-rolled. If
you find yourself wanting a dependency there, the answer is either a smaller
scope or a better-targeted 60 lines — open an issue and let's talk about it
before you write it.

`src/installer/` and the test files may use dev dependencies freely, since
neither ever ships into a client's harness.

## How the pieces fit

```
skill/SKILL.md          router the agent reads to know when to act
skill/reference/*.md    one file per command — the agent's actual procedure
skill/scripts/*.mjs     deterministic checks; no LLM, no network (except DataForSEO)
skill/scripts/lib/      frontmatter parser, Markdown scanner, config loader
src/installer/          copies skill/ into a harness folder
bin/seodraft.mjs        CLI entry
fixtures/astro-blog/    a content repo seeded with known defects
tests/helpers.mjs       makeTempSite / copyFixture / validBody helpers
```

The product's whole design is a division of labor: **the agent proposes,
deterministic code gates, the human approves.** When you are deciding where a
change belongs, that sentence usually answers it. Judgment goes in
`reference/*.md` where it is cheap to change. Anything with a factual answer
goes in a script with tests.

## Three common contributions

### Adding a framework detector

`skill/scripts/detect.mjs`. Add a branch to `detectFramework` keyed on a config
file that only that framework has, returning candidate content directories that
actually contain posts. If the framework ships an explicit content schema
(like Keystatic or Astro collections), add its filename to `SCHEMA_FILES` —
that list matters more than it looks, because a schema declares fields that
are absent from every published post when they hold their default value, and
sampling alone cannot see them.

Add a test in `detect.test.mjs` that builds a minimal temp repo. Do not add
fixtures for it.

### Adding a gate or audit rule

Two things decide where a rule goes and how loud it is:

- **`gate.mjs` blocks; `audit.mjs` never does.** The gate runs on one article
  before it is published and exits 1 on any error-severity failure. The audit
  runs over existing content and always exits 0, because its findings are the
  product.
- **Severity is not a style choice.** A rule is an `error` only when the answer
  is unambiguous and the content is wrong regardless of anyone's standard — a
  missing meta description, a link to a slug that does not exist. A rule is an
  `advisory` when it encodes a standard that reasonable content can predate.
  This is why the AEO rules (`tldr-length`, `faqs-min`) are errors in the gate
  and advisories in the audit: new content has no excuse, but erroring every
  post in a five-year-old archive produces noise and buries the findings that
  matter.

Resist the urge to gate taste. Whether the prose is any good is not a rule; it
is the agent's job, guided by `reference/write.md`. Hardcoding taste as a
blocking check is unmaintainable and it makes people stop trusting the gate.

Every rule needs **one passing and one failing test**. Use `makeTempSite` from
`tests/helpers.mjs` for synthetic cases.

### Adding a harness provider

`src/installer/providers.mjs` — one entry mapping the provider id to its
harness folder. Skill content is identical across providers; only the wrapper
folder differs. If a provider ever needs genuinely different content, say so in
the issue rather than adding a build step for it.

## Touching the fixture

`fixtures/astro-blog/` is not sample data, it is a **seeded defect matrix**. The
audit tests assert the exact set of findings it produces, down to the count. If
you edit a post there, expect `audit.test.mjs` to fail and understand why
before you change the assertion.

Two traps that have already bitten:

- Writing the literal word `TODO` in fixture prose trips the gate's own
  `placeholder-text` rule.
- Fixture dates are in 2030 on purpose, so the 12-month `stale-post` rule stays
  deterministic instead of flipping as real time passes.

## Docs are part of the change

The agent-facing docs are not documentation *about* the code, they are the
instructions the agent executes. A rule change that does not update
`skill/reference/*.md` ships a gate the agent does not know how to satisfy.

If you change a rule, its name, or its severity, update the matching table in
the relevant `reference/*.md` and in `README.md` in the same PR.

## Commits and PRs

- **Conventional commits**: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`,
  `chore:`. The subject says what changed; the body says why.
- No AI attribution or co-author trailers.
- Keep a PR to one reviewable idea. A new rule plus a refactor of the parser is
  two PRs.
- CI runs the suite on every PR against the Node versions the package claims to
  support. It has to be green.

## Reporting things

- **Bugs**: the issue template asks for your `.seodraft/config.json` (redact
  `siteUrl` if you like) and the JSON the script printed. Those two things
  answer most reports immediately. Never paste `config.local.json` — it holds
  credentials.
- **Rule proposals**: say which command it belongs to, what severity, and what
  a false positive would look like. That last one is the part that decides
  whether a rule is worth having.
- **Security**: see [SECURITY.md](SECURITY.md). Do not open a public issue.

## What is deliberately out of scope

Google Search Console OAuth and opportunity scoring, AI-citation tracking,
WordPress publishing and image generation are all deferred, not forgotten. If
you want to work on one, open an issue first — they change the shape of the
product and are better designed before they are written.
