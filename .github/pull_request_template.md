<!--
Thanks for the PR. The checklist is short and every item exists because
skipping it has broken something before.
-->

## What and why

<!-- What changed, and what problem it solves. Link an issue if there is one. -->

## Checklist

- [ ] `pnpm test` passes
- [ ] Nothing under `skill/scripts/` imports anything but `node:` builtins and
      relative paths (`node scripts/check-no-runtime-deps.mjs`)
- [ ] New or changed rule: **one passing and one failing test** for it
- [ ] New or changed rule: the matching table in `skill/reference/*.md` and
      `README.md` is updated in this PR — the agent executes those docs, so a
      rule the docs do not mention is a gate the agent cannot satisfy
- [ ] Fixture edited? `audit.test.mjs` asserts its exact finding set; the
      assertion was updated deliberately, not to make red go green
- [ ] Conventional commit subject, no AI attribution or co-author trailers

## Severity, if this adds a rule

<!--
`error` only when the content is wrong regardless of anyone's standard.
`advisory` when it encodes a standard that reasonable content can predate.
Say what a false positive would look like.
-->

## How you verified it

<!--
Beyond the suite. Running it against a real content repo is the strongest
evidence, and it is what has caught most of the real bugs in this project.
-->
