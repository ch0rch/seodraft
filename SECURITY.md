# Security

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/ch0rch/seodraft/security/advisories/new).
Please do not open a public issue.

Expect an acknowledgement within a few days. If a fix is warranted it ships as
a patch release with credit, unless you prefer otherwise.

## What is in scope

seodraft runs on a developer's machine, inside their AI harness, against their
own repository. The interesting surfaces are:

- **Credential handling.** DataForSEO credentials are read from
  `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` or from
  `.seodraft/config.local.json`, which `/seodraft init` adds to `.gitignore`.
  Anything that could leak them — into stdout, into a committed file, into an
  outbound request other than DataForSEO's own API — is a vulnerability.
- **Path traversal on write.** The installer must only ever write inside
  `<harness>/skills/seodraft/`, and the write pipeline only inside the
  configured `contentDir`. Anything that escapes those is a vulnerability.
- **Untrusted content.** The scripts parse frontmatter and Markdown from files
  the user may not have authored. A crash is a bug; a crash that executes
  something is a vulnerability. The parsers are deliberately hand-rolled and
  never `eval`, never resolve references, and never fetch anything.

## What is not in scope

- The agent writing content you disagree with. That is a prompt and taste
  question, addressed in `skill/reference/*.md`.
- Reports that the tool "sends your content to an LLM". It does not: there is
  no model API key in this package. Your harness is the model, and it was
  already reading your repo.
- The one outbound network call, to `api.dataforseo.com`, which happens only
  when you have configured credentials.

## A note on credentials

If you think you have committed `.seodraft/config.local.json`, rotate the
DataForSEO credentials first and clean the history second. Rotation is the part
that actually stops the leak.
