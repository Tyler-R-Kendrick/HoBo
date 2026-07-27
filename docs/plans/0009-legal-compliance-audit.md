---
type: Review Findings
title: "Legal and compliance audit — provider terms, licensing, and the free-credit routing question"
description: "Audit of HoBo's legal exposure at a9555d7c: third-party provider terms of service against the maximize-credits objective, outbound/inbound licensing hygiene, trademark use, public claims, and privacy/terms readiness — with a prioritized remediation list."
tags: [hobo, plans]
---

# Legal and compliance audit

> Audited at commit `a9555d7c` (2026-07-27). Scope: the design suite (`docs/design/`), the
> production workspace (`packages/`), `examples/ci-runner-balancing/`, the published site
> (`site/`), repository licensing metadata, and CI workflows. Provider terms were read from
> the vendors' live published pages on the audit date and quoted below.
>
> **This is an engineering audit, not legal advice.** The provider-terms readings below are
> quotations plus a plain reading of them; several of the conclusions turn on facts about how
> HoBo is eventually operated commercially, which only counsel can settle. Items marked
> **L1** are the ones worth putting in front of a lawyer.

## Summary

HoBo's credit-routing design is, as currently built, on the right side of the line — but for a
structural reason that is nowhere written down, and that a future product decision could erase
without anyone noticing. The repository has no record anywhere of the provider terms it depends
on. That is the central finding.

Separately, the repository has a concrete and immediately fixable outbound-licensing defect: 24
packages are configured to publish to npm with no license metadata and no `LICENSE` file in the
published tarball.

| # | Finding | Severity | Type | Status |
|---|---|---|---|---|
| [1](#1-the-account-ownership-boundary-is-load-bearing-and-undocumented) | The account-ownership boundary is load-bearing and undocumented | **High** (L1) | Provider terms | **Fixed** — [ADR-0129](../design/adr/07-portability-extensibility.md#adr-0129) |
| [2](#2-a-hosted-multi-tenant-hobo-would-breach-provider-terms-outright) | A hosted multi-tenant HoBo would breach provider terms outright | **High** (L1) | Provider terms | **Fixed** — ADR-0129 §4 + paid-GA launch blocker; **counsel review still open** |
| [3](#3-24-packages-publish-to-npm-with-no-license-metadata) | 23 packages publish to npm with no license metadata | **High** | Outbound licensing | **Fixed** — gated by `licenses:check` |
| [4](#4-third-party-pricing-is-hardcoded-misattributed-and-already-wrong) | Third-party pricing is hardcoded, misattributed, and already wrong | **Medium** | Misrepresentation | **Fixed** |
| [5](#5-no-inbound-dependency-licence-gate) | No inbound dependency-licence gate | **Medium** | Inbound licensing | **Fixed** — `scripts/check-licenses.ts` |
| [6](#6-the-public-site-has-no-terms-privacy-notice-or-licence-notice) | The public site has no terms, privacy notice, or licence notice | **Medium** | Terms/privacy | **Fixed** — `/legal` |
| [7](#7-no-contributor-licensing-mechanism-dcocla) | No contributor licensing mechanism (DCO/CLA) | **Medium** | Inbound licensing | **Fixed** — inbound=outbound + DCO |
| [8](#8-provider-trademarks-are-used-without-a-notice) | Provider trademarks are used without a notice | **Low** | Trademark | **Fixed** — `/legal` + AGENTS.md rule |
| [9](#9-the-last-resort-runner-shifts-execution-risk-onto-a-developer-machine) | The last-resort runner shifts execution risk onto a developer machine | **Low** | Liability | **Fixed** — enforced guard + tests |

> **Remediation status (2026-07-27).** All nine findings are remediated in the same
> change as this audit; each section's Remediation paragraph records what landed. Two
> caveats that are *not* closed by code:
>
> - **Finding 2 still needs counsel.** The invariants are recorded and the launch
>   blocker is filed, but confirming that the intended hosted commercial model is
>   permitted by each vendor's terms is a legal determination, not an engineering one.
> - **Finding 4's enum was deliberately not renamed.** The audit suggested retagging
>   `source.type: "declared-provider"`. On inspection that value is a wire-contract
>   enum pinned in CUE, PACT contracts, and draft proofs across ~30 files, and it
>   contrasts with `observed-executor` — it reads as "declared, not measured", which is
>   defensible. The clearly-false part was the fabricated `signedAt` attestation
>   timestamp, which is gone everywhere and replaced with `transcribedOn` plus a source
>   URL. Renaming the enum remains available if the vocabulary is revisited.

Two things are already handled well and should not be disturbed:

- **Public compliance claims are disciplined.** `governance-planes.md:65` and
  `legal-privacy-terms-readiness.md:225` explicitly block unsupported SOC2/GDPR/HIPAA claims, and
  `compliance-evidence-pack.md:69` bars claiming certification. The posture — "HoBo produces the
  replayable facts; it does not run the attestation program" — is the correct one and is
  consistently held across the suite.
- **Agent-tooling data egress is disclosed.** `docs/agent-tooling.md:64` names gbrain as the one
  always-configured tool with third-party data egress and warns not to point it at content you
  don't want shared. That is the right level of candour.

---

## 1. The account-ownership boundary is load-bearing and undocumented

**Severity: High (L1) · Provider terms**

The `maximize-credits` objective ([ADR-0071](../design/adr/01-architecture-core.md#adr-0071)) ranks
providers by effective marginal cost — `0` while free-tier headroom remains, list price after — so
that "free credits are exhausted before realtime billing starts." Read cold, that is a description
of free-tier arbitrage, and it is the thing to be careful about.

What makes the current implementation defensible is a single structural fact:

- The Dispatcher considers **only providers the operator registered** —
  "It considers **exactly the providers the developer/platform registered**"
  ([ADR-0071](../design/adr/01-architecture-core.md#adr-0071) §1).
- Credentials are **brokered into the operator's own provider accounts**, never held by HoBo:
  `packages/providers/runner-depot/src/manifest.ts` publishes
  `mode: "oidc-trust-exchange"` with `staticSecrets: false`, and
  `packages/providers/runner-blacksmith/src/manifest.ts` states "the Blacksmith org relationship
  itself is held by the Yard broker — no static org token in any Bindle, Camp or this package."
- Third-party rungs are **capability-guarded off** until the operator installs that provider's
  GitHub App (`HOBO_RB_ENABLE_<PROVIDER>`, `examples/ci-runner-balancing/src/registry.ts`).
- Nothing in the repository creates accounts. `bootstrap-installer.md:63` explicitly scopes account
  creation out.

So today HoBo consumes *your* free tier on *your* account under *your* contract with each vendor —
the same thing a Makefile or a Terraform provider does. Rotating to the next provider when one
tier is exhausted is ordinary cost optimisation, not circumvention: each vendor's free tier is
being used once, by the party entitled to it, within one account.

**The problem is that this boundary is asserted nowhere.** A full-text search of `docs/design/`,
`packages/`, `examples/`, `AGENTS.md`, and `README.md` returns **zero** occurrences of "terms of
service", "acceptable use", "resale", "service bureau", or "provider terms". There is no ADR
stating that HoBo never holds provider accounts on a customer's behalf, no rule that credits are
never pooled across tenants, and no requirement that an adapter record the terms it is being used
under. For a project whose headline objective is "maximize free credits," that is the single
largest gap in the compliance surface — the constraint that makes the design lawful is currently
an accident of implementation rather than a stated invariant.

**Remediation.** Write an ADR — the natural home is
[`07-portability-extensibility.md`](../design/adr/07-portability-extensibility.md), adjacent to
ADR-0064's scope cut — fixing the following as binding invariants:

1. Every registered provider is registered **under the operator's own account**, under the
   operator's own contract with that vendor. HoBo never holds a provider account on a customer's
   behalf and never fronts its own account for customer workloads.
2. Free-tier headroom is **never pooled, shared, resold, or transferred** across tenants,
   workspaces, or accounts. The `CreditLedgerView` is scoped to one account's entitlement.
3. HoBo never creates provider accounts, and never rotates identities or accounts to reset a free
   tier. Rotation happens **across** providers, never across accounts within a provider.
4. Each execution-host adapter carries a `terms` reference in its capability manifest — a URL and
   a reviewed-on date for the vendor terms it operates under — so the obligation is visible at the
   adapter boundary where it is incurred.
5. Registering a provider surfaces a one-line acknowledgement that the operator's own agreement
   with that vendor governs the usage HoBo will drive.

Invariants 1–3 are cheap now and expensive later; they are what stops a future product decision
from silently converting a lawful tool into an unlawful one.

## 2. A hosted multi-tenant HoBo would breach provider terms outright

**Severity: High (L1) · Provider terms**

This is the scenario worth being concerned about, and it is closer than the design admits.
`docs/design/hobo-broker.md` describes a **hosted** broker authority ("the Conductor") that "decides
where apps are hosted, spins resources up and down" across providers, with a metered billing plane
(`createMeteredBillingPlane`). ADR-0107 confirms that hosted-business commercialisation records —
billing plans, credits, invoice lifecycle, tax posture — now live in `docs/design/`. The
architecture is being pointed at a commercial hosted offering.

If a hosted HoBo ever runs customer jobs on **HoBo's own** provider accounts, three separate
prohibitions bite:

**GitHub** — [Terms for Additional Products and Features](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features)
prohibits, for Actions:

> "The provision of a stand-alone or integrated application or service offering the Actions product
> or service … for commercial purposes"

and, separately:

> "You may only access and use GitHub Actions to develop and test your application(s). **Only one
> licensed user may access a virtual machine provided by Actions at any time.**"

and, for GitHub-hosted runners:

> "any other activity unrelated to the production, testing, deployment, or publication of the
> software project"

The first clause is a direct prohibition on offering Actions as part of a commercial service. The
second forecloses sharing a runner VM across customers. The third constrains what may run on a
hosted runner at all — a meta-cloud that routed *application* workloads (as opposed to that
project's own CI and builds) onto GitHub-hosted runners would be outside it. Enforcement is
explicit: misuse "may result in termination of jobs, restrictions in your ability to use GitHub
Actions, disabling of repositories … or in some cases, suspension or termination of your GitHub
account."

**Blacksmith** — [Terms of Service](https://docs.blacksmith.sh/about/terms-of-service) §3 prohibits:

> "provide, sell, transfer, sublicense, lend, distribute, rent, assign, **act as service bureau**,
> or otherwise allow third parties to access or use the Services"

and separately prohibits acting to "circumvent access restrictions of the Services." The
service-bureau clause is a flat ban on the hosted model, with no commercial-purpose qualifier to
argue about.

**Depot** — [Terms of Service](https://depot.dev/terms-of-service) contains no explicit resale
clause, but does provide:

> "Your login may only be used by one person — i.e., a single login may not be shared by multiple
> people."

and prohibits sharing API tokens "to exceed Depot's rate limitations." A pooled hosted account
serving many customers strains both.

**The practical upshot.** The BYO-account model of Finding 1 is the *only* model these terms
support. A hosted HoBo must remain a control plane that acts on credentials the customer supplies
for the customer's own accounts — which is, helpfully, exactly what the secretless token-broker
architecture already does. What must never happen is HoBo maintaining its own GitHub/Blacksmith/
Depot accounts and metering customer usage against them, however attractive that looks as a
margin story. Note also that the metered billing plane compounds this: charging for usage that
runs on a vendor's free tier under a service-bureau arrangement is the fact pattern most likely
to draw a vendor's attention.

**Remediation.** Extend the ADR from Finding 1 with an explicit hosted-operator rule: the hosted
broker brokers **credentials the customer owns**, and the `BillingPolicy` may meter HoBo's own
control-plane services but never resells provider capacity. Add a row to
[`legal-privacy-terms-readiness.md`](../design/legal-privacy-terms-readiness.md)'s launch checklist
— "Provider terms of service: per-provider review that the intended commercial model is permitted"
— as a **launch blocker** for paid GA, owned by the legal owner. This is the item to take to
counsel first, because it constrains the business model, not just the code.

## 3. 24 packages publish to npm with no license metadata

**Severity: High · Outbound licensing**

Every workspace package is missing a `license` field, and there is not one `LICENSE` file anywhere
under `packages/` (`find packages -name LICENSE | wc -l` → `0`). Twenty-three of them are
publishable — no `"private": true`, and `publishConfig.access: "public"`:

```
@hobo/bindles  @hobo/camps  @hobo/cli  @hobo/componentize  @hobo/conformance
@hobo/contract-harness  @hobo/contracts  @hobo/core  @hobo/data  @hobo/events
@hobo/hobo  @hobo/iac-crossplane  @hobo/iac-pulumi  @hobo/iac-terraform
@hobo/identity  @hobo/junctions  @hobo/mcp  @hobo/policy  @hobo/runtime
@hobo/runtime-local  @hobo/stage-gate  @hobo/wit  @hobo/yards
```

Compounding it, each package sets `"files": ["dist"]`, so even if a root `LICENSE` existed at pack
time it would not be included in the tarball. A consumer installing `@hobo/core` today would
receive code with no licence grant in the package and no licence field in the registry metadata.

Two consequences, both real:

- **Legally**, the root MIT `LICENSE` covers the repository, so the grant arguably follows the
  code — but a published artifact with no notice is a poor place to be arguing from, and MIT
  itself requires that "the above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software." Publishing without it is non-compliance with
  the project's own licence.
- **Practically**, every corporate licence scanner (FOSSA, Snyk, Black Duck, `license-checker`)
  classifies a missing `license` field as `UNKNOWN` or `UNLICENSED`, which in most enterprise
  policies is an automatic block. This will suppress adoption of the packages at exactly the moment
  they ship.

**Remediation.** Add `"license": "MIT"` to every package manifest; add `LICENSE` to each package's
`files` array and either copy or symlink the root `LICENSE` into each package directory; and extend
`pnpm run standards:check` to fail when a non-private package lacks a `license` field or a packed
`LICENSE`. This is a mechanical change and should land before any registry publish.

## 4. Third-party pricing is hardcoded, misattributed, and already wrong

**Severity: Medium · Misrepresentation**

`packages/providers/runner-github/src/manifest.ts:30` states:

> "Declared cost facts — REAL GitHub Actions public list prices (Linux 2-core hosted runner
> $0.008/min; 2,000 included free minutes/month on the Free plan)"

and sets `marginalPrice: "0.0080"`. GitHub's
[current published rate](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions)
for Linux 2-core is **$0.006/min**. The figure is stale by 25%.

The repository already knows the right number: `examples/ci-runner-balancing/src/registry.ts:37`
uses `0.006`. So the two credit ledgers in the repo disagree about the price of the same runner,
and the one that is wrong is the one shipped in a publishable package. `runner-blacksmith`
propagates the same stale figure in its comparison comment.

Three distinct problems:

1. **A correctness bug.** The Dispatcher's whole value proposition is ranking by effective marginal
   cost. A 25% error in the reference provider's price changes rankings.
2. **A misattribution.** Both manifests tag these facts `source: { type: "declared-provider" }`,
   and `runner-depot`/`runner-blacksmith` additionally emit a literal
   `signedAt: "2026-07-01T00:00:00Z"`. `declared-provider` and a `signedAt` timestamp assert that
   the *provider* declared and attested these figures. No provider did — HoBo's authors transcribed
   them from public pricing pages. The example package gets this right by tagging its equivalents
   `COST_TRUST_DECLARED_UNVERIFIED`; the shipped packages do not.
3. **A standing obligation.** Publishing specific dollar figures about named competitors, labelled
   "REAL … public list prices," creates a duty to keep them accurate. Stale competitor pricing in a
   shipped artifact is the kind of thing that draws a complaint under general false-advertising
   principles, and the trust labelling makes it worse by dressing a transcription up as a vendor
   attestation.

**Remediation.** Retag the shipped manifests to the honest trust level the example already uses
(`declared-unverified`, third-party-transcribed), drop the fabricated `signedAt` or replace it with
a `transcribedAt` + source-URL pair, correct GitHub's rate to `0.0060`, and add a dated
"verified against vendor pricing page on `<date>`" comment to each. Consider a scheduled check that
flags cost facts older than a chosen staleness window — this is a data-freshness problem that will
recur.

## 5. No inbound dependency-licence gate

**Severity: Medium · Inbound licensing**

There is no licence checking anywhere in the gate stack. `pnpm run standards:check`,
`architecture:guard`, and the CI lanes in `.github/workflows/hobo-ci.yml` cover TypeScript,
Protobuf/CUE/PACT evidence, docs freshness, and secret scanning — but nothing inspects the licences
of the dependency tree. For an MIT-licensed project intending to publish 24 packages, a single
copyleft transitive dependency (GPL/AGPL) is a genuine problem, and the current setup would not
notice it.

`docs/design/sbom-vulnerability-notice-evidence.md` contemplates SBOM work, which is the natural
carrier for this.

**Remediation.** Add a licence-policy gate to CI — an allowlist (MIT, Apache-2.0, BSD-2/3, ISC,
0BSD, Unlicense, CC0) with an explicit review path for anything else, failing the build on a
disallowed or unknown licence. Generate a `NOTICE`/third-party-licence file as part of the release
artifact set and wire it into the SBOM evidence pack.

## 6. The public site has no terms, privacy notice, or licence notice

**Severity: Medium · Terms/privacy**

<https://tyler-r-kendrick.github.io/HoBo/> is live. `site/src/components/Footer.astro` renders a
bare `© {year}` with no entity name, and the site's nav contains no terms, privacy, or licence
page.

The mitigating facts are good ones, and they cap the severity here: the site is a static Astro
build with **no analytics, no tracking scripts, and no forms** (verified by search across
`site/src` for `analytics|posthog|gtag|plausible|fathom|umami` and for `<form`/`input`), and it is
served from GitHub Pages. So there is essentially no first-party data collection to disclose — the
residual is GitHub's own server logs, which GitHub discloses under its own privacy statement.

What is missing is nonetheless standard for a public project site, and one item is a live
inconsistency: the site publicises MIT-licensed software with no licence notice or link anywhere on
it.

**Remediation.** Add to the footer: the copyright holder's name alongside the year, a link to the
`LICENSE`, and a short `/legal` page stating that the site is static and collects nothing beyond
GitHub Pages' own request logs, that the software is MIT-licensed and provided without warranty
(pointing at the LICENSE's existing disclaimer rather than restating it), and that third-party
product names are the trademarks of their owners (Finding 8). This is a small page, and it closes
Findings 6 and 8 together. Note that this covers the *site* only — customer-facing terms, a privacy
notice, and a DPA for any hosted product remain correctly tracked as launch blockers in
[`legal-privacy-terms-readiness.md`](../design/legal-privacy-terms-readiness.md), and this audit
does not disturb that.

## 7. No contributor licensing mechanism (DCO/CLA)

**Severity: Medium · Inbound licensing**

[`CONTRIBUTING.md`](../../CONTRIBUTING.md) covers scope, local checks, and documentation
expectations thoroughly, but says nothing about the licence terms under which contributions are
received. There is no DCO sign-off requirement, no CLA, and no inbound=outbound statement. The
GitHub Terms of Service default (contributions to a public repo are licensed under the repo's
terms) provides a fallback, but it is thinner than what a project intending to publish packages and
potentially relicense or dual-license later would want.

**Remediation.** Add an inbound=outbound clause to `CONTRIBUTING.md` — "contributions are accepted
under the MIT licence in `LICENSE`" — and decide between DCO sign-off (lighter; `git commit -s`
plus a CI check) and a CLA (heavier; needed only if relicensing or a commercial dual-licence is
plausible). Given the hosted-business direction in ADR-0107, DCO at minimum is worth having in
place before external contributions accumulate.

## 8. Provider trademarks are used without a notice

**Severity: Low · Trademark**

The repository names a large number of third-party marks in package identifiers, registry data,
docs, and site copy: GitHub, Blacksmith, Depot, Namespace, BuildJet, Actuated, WarpBuild, Ubicloud,
RunsOn, Cirun, Cirrus, AWS, Azure, GCP, Cloudflare, Vercel, Pulumi, Terraform, Crossplane, Argo,
OPA. Package names embed them directly (`@hobo/runner-blacksmith`, `@hobo/provider-cloudflare`).

This is overwhelmingly **nominative fair use** — naming a product to describe interoperating with
it is exactly what the doctrine protects, and it is what every adapter ecosystem does. Two things
keep it clean, and they are worth doing deliberately:

- No third-party **logos** are currently used. `site/public/parallax/` contains only original
  mascot and scenery art, and `site/src/components/Footer.astro` uses only the GitHub mark in its
  own "HoBo on GitHub" link. Keep it that way; logos carry materially more risk than word marks.
- Nothing implies endorsement, affiliation, or certification by any of these vendors — a line worth
  holding explicitly in site and marketing copy as the project moves toward launch.

One thing to check before publishing: `examples/ci-runner-balancing` seeds its provider registry
from [neysofu/awesome-github-actions-runners](https://github.com/neysofu/awesome-github-actions-runners)
and credits it in prose. Confirm that list's licence permits the derivation and add a formal
attribution line if it requires one.

**Remediation.** Add a trademark line to the `/legal` page from Finding 6: "All third-party product
and company names are trademarks of their respective owners. HoBo is not affiliated with,
endorsed by, or certified by any of them." Add a rule to `AGENTS.md` that third-party logos are not
to be added to the site or docs without review.

## 9. The last-resort runner shifts execution risk onto a developer machine

**Severity: Low · Liability**

`examples/ci-runner-balancing/src/host-runner.ts` registers the operator's machine as an ephemeral
self-hosted GitHub Actions runner to drain queued jobs when every hosted provider is blocked. This
executes repository workflow code on a personal or corporate machine.

The example handles this well: it defaults to **ephemeral** registration (one job per registration,
auto-deregister), and both the README and `docs/design/ci-runner-balancing-example.md` state the
posture plainly — "a registered runner executes the repository's workflow code on your machine. Use
it for your own repository and branches only — never expose it to untrusted fork PRs." That matches
GitHub's own guidance, which recommends against self-hosted runners on public repositories.

The residual concern is only that this is documented as posture rather than enforced as a check,
and it becomes sharper if this pattern is ever promoted from reference example to product feature —
at which point "we told you in the README" is a weaker position than a guard.

**Remediation.** Have `host-runner` refuse to register against a public repository, or against a
repository whose settings permit fork-PR workflow runs, unless an explicit override flag is passed.
If the pattern is ever productised, pair it with an in-product acknowledgement rather than prose.

---

## Suggested order of work

1. **Finding 3** — package licence metadata. Mechanical, blocks nothing, must precede any publish.
2. **Finding 1** — the account-ownership ADR. Cheap now, and it is what keeps Finding 2 from
   becoming a problem by default.
3. **Finding 4** — correct and retag the cost facts. Fixes a live ranking bug alongside the
   attribution issue.
4. **Findings 6 + 8** — one `/legal` page and a footer change closes both.
5. **Findings 5 + 7** — licence gate and DCO; natural companions to the SBOM work already scoped.
6. **Finding 2** — the launch-checklist row and the conversation with counsel. Blocking for paid
   GA, not for continued development.
7. **Finding 9** — the `host-runner` guard, whenever that example is next touched.

## What was checked and found clean

- **No account multiplication anywhere.** No code creates provider accounts, rotates identities, or
  resets a free tier by re-registering. Credit rotation is strictly *across* providers within one
  operator's registered set.
- **No credential pooling.** The secretless token broker holds `credentialRef` pointers, and
  `hobo-broker.md` keeps placement authority and credential authority explicitly separate.
- **No unsupported compliance claims.** SOC2/GDPR/HIPAA/ISO claims are blocked by explicit scope
  guards in three separate design docs.
- **No first-party data collection on the site.** No analytics, no tracking, no forms.
- **Agent-tooling egress is disclosed**, including the one tool (gbrain) that sends content to a
  third-party embedding provider.
- **Export control** — no cryptographic implementations beyond `node:crypto` SHA-256 digests for
  content addressing; no encryption product concerns at this stage.

## Sources

- [GitHub Terms for Additional Products and Features](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features)
- [About billing for GitHub Actions](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions)
- [Blacksmith Terms of Service](https://docs.blacksmith.sh/about/terms-of-service)
- [Depot Terms of Service](https://depot.dev/terms-of-service)
