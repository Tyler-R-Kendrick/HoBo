# Security policy

HoBo is not a shipped product yet, but this repository contains security-relevant design material, executable draft contracts, agent tooling, CI workflows, and dependency manifests. Treat vulnerabilities in those surfaces seriously.

## Supported versions

Only the default branch and active pull requests are supported. Archived requirements and historical planning material are retained for context and are not supported runtime artifacts.

## What to report

Please report:

- Secrets, tokens, credentials, or private keys committed to the repo.
- CI workflow changes that could exfiltrate secrets or run untrusted code unsafely.
- Agent-tooling configuration that causes unexpected data egress or unsafe command execution.
- Draft contract code that contradicts documented deny-by-default, secretless, tenant-isolation, provenance, or no-egress claims.
- Dependency or script behavior that materially changes the trust boundary documented in `docs/agent-tooling.md`.

## How to report

If private vulnerability reporting is enabled for this repository, use GitHub's private vulnerability reporting flow. Otherwise, contact the maintainers through the repository owner channel before opening a public issue.

Do not include live secrets, exploitable credentials, or private tenant data in public issues, pull requests, commit messages, logs, or screenshots.

## Disclosure expectations

Maintainers should acknowledge security reports, confirm the affected repo surface, and fix or document the issue before public disclosure. Security fixes should include a regression test, docs update, or explicit explanation when neither applies.
