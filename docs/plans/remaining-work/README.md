---
type: Plan
title: "Remaining work: swarm execution contract"
description: "A self-contained implementation contract for parallel coding agents: the celld live lane, the transport-guard policy extension, boundary-guard hardening, the assertion-strength sweep, and the package decomposition — with the schemas specified up front so no swarm waits on another."
tags: [hobo, plan, swarm, decomposition, transport, boundaries]
---

# Remaining work — swarm execution contract

You are one agent in a swarm. This document is your **complete** brief. Do not
ask the originating conversation for context; it is gone. Everything you need —
file ownership, the schemas to build against, the acceptance bar, and the ways
this work has already gone wrong — is here.

Read **§0 Ground rules** and **§1 How this work has already failed** before
touching anything. They are not preamble. Every rule in them was paid for.

---

## 0. Ground rules

### 0.1 Environment

- Prefix every shell command with `NODE_OPTIONS= `. The ambient value breaks
  `tsx`.
- `cd /home/user/HoBo` first in every Bash call. The working directory does not
  persist between calls.
- Pass `--concurrency=100%` to every `turbo` invocation — one task per logical
  CPU. Turbo's default of 10 OOM-kills a fully cold sweep on this four-core,
  16 GB box, and it is free: on a fixed 224-task set, concurrency 4 and
  concurrency 10 finish within noise of each other. Exit code 137 is the OOM
  killer, never a failing assertion. Re-read that sentence before you diagnose a
  137 as a test failure.
- `turbo.json` runs `envMode: "strict"`. A task sees only what
  `globalPassThroughEnv` lists. If you add a lane that reads an environment
  variable, add the variable there or your documented escape hatch will
  silently not exist.
- CI is account-side dark. Every claim you make rests on local gates. Do not
  wait on GitHub Actions; do not treat green CI as a gate you can lean on.

### 0.2 Never do these

- **Never `git checkout --` a directory to "reset" it.** It has destroyed
  uncommitted work in this repo before, including a fix nobody noticed was gone
  for two commits.
- **Never SIGKILL a build.** A killed `tsc` leaves a truncated `.js`, turbo
  caches it as a successful build, and every later build restores the
  corruption. Recovery needs `turbo run build --force`, and diagnosis costs an
  hour because the symptom is a nonsense import error in an unrelated package.
- **Never run a build or test sweep while editing the tree.** The result
  describes neither the before nor the after state.
- **Never blanket-substitute text across a file.** Four separate defects in this
  repo came from it: a `get(` → `mustGet(` rename that hit a method definition
  while leaving its call sites, an inserted `assert()` that contradicted the
  `expect(...).toBeNull()` two lines below it, a namespace prefix applied to a
  local function's own recursive calls, and `--unsafe` renaming a live `greet()`
  to `_greet` while an inline `onclick` still called it. Use AST edits, or exact
  anchors with an assertion that the anchor matched exactly once.
- **Never insert an import by appending after the last line matching
  `^import `.** Multi-line import statements make that land *inside* a
  statement. Insert **before the first** `^import ` line — always a statement
  boundary — and let the formatter sort it.
- **Never disable TLS verification** and never unset `HTTPS_PROXY`. If a chain
  will not verify, trust the correct root via `NODE_EXTRA_CA_CERTS`.
- **Never commit secrets.** Environment variable *names* only.

### 0.3 The falsification requirement — this is the acceptance bar

Every test you write must be **proven able to fail**. Delete the code under
test, or invert the condition, run the test, observe it fail, restore, observe
it pass. State both observations in your handback.

A test you have not seen fail is not evidence. This repo has shipped three
tests that passed for the wrong reason:

- one asserted `.toThrow(/PROVIDER_CONTRACT_CHANGED|path/)`, a pattern the
  *ordinary* refusal message also matched, so it went green whether or not the
  behaviour it named existed — and a false security finding was published on
  the strength of it;
- one called `assert.throws(() => f(x, UNDEFINED_CONST))` where the constant was
  never imported, so `assert.throws` observed a `ReferenceError` rather than a
  refusal;
- one tampered with a document signature and verified it against a *freshly
  generated* attestor's keys, so it would have been denied either way.

Therefore: **assert on the specific refusal, never a generic one.** Match the
message fragment unique to the branch you mean. `assert.throws(fn)` with no
matcher is worthless — treat it as a finding wherever you see it.

### 0.4 Verify claims you inherit, including from this document

Statements in prose age badly. This repo has carried, in committed prose:

- "eight provider transports carry their own copy of the guard" — it was six,
  plus one same-origin guard with different semantics and one that was not an
  HTTP transport at all;
- "`broker-remote-client` accepted a `presenter` option and both callers were
  passing one" — neither caller passed one;
- "`biome.json` carries `linter.enabled: false`, so `packages/` has never been
  lint-gated" — the next block overrides it to `true` for every package, and the
  false version excused a 500-finding backlog;
- "`%2e%2e` survives URL parsing" — in `@hobo/core`'s own doc comment; WHATWG
  resolves it during parsing.

Before you rely on a count, a claim, or a "this is deliberate", check it against
the code. If it is wrong, correct it *and say so in your handback*.

### 0.5 Isolation, and the one thing that genuinely serialises

Exclusive *file* ownership is not enough on its own. Nine agents in one working
tree share a git index, and their commits interleave into an unreviewable
history even when no two touch the same file. **Each swarm works in its own git
worktree on its own branch** (`git worktree add ../hobo-<swarm-id>
-b swarm/<swarm-id>`), commits there, and hands back. The coordinator
integrates. Do not `git pull`, rebase onto another swarm's branch, or merge
anything yourself.

**The lockfile is the real serialisation point, and pretending otherwise wastes
a run.** A new package is not resolvable until `pnpm install` links it, and
`pnpm-lock.yaml` is coordinator-owned. So if you are E–H:

- Run `pnpm install` locally. You need it for your own tests to resolve.
- **Do not commit `pnpm-lock.yaml`.** Report in your handback that you added a
  workspace package. The coordinator regenerates the lockfile once, after all
  four land, because four independently-regenerated lockfiles conflict in ways
  that are tedious and easy to resolve wrongly.
- If your `pnpm install` reports peer warnings unrelated to your package, ignore
  them; they pre-exist.

This is the honest shape of the parallelism: design, implementation and testing
all run concurrently, and exactly one integration step — the lockfile and the
coordinator-owned files — does not.

### 0.6 Registering a new package — read this before creating one

**A new package that is not registered silently disables the entire boundary
gate.** `parseWorkspaceEdge` *throws* on an unclassified workspace path rather
than reporting it, so the gate aborts before evaluating any rule and reports
nothing wrong. This repo has already shipped that state: `@hobo/bindings` went
in without its entry and trunk had no boundary enforcement at all, silently,
until someone noticed the gate had stopped saying anything.

Two consequences bind Swarms E–H:

1. **Package location.** `pnpm-workspace.yaml` uses explicit per-directory
   globs — `packages/*`, `packages/adapters/*`, `packages/providers/*`, and so
   on. There is no `packages/manifests/*`. The manifest packages therefore live
   **flat at `packages/manifest-<name>`**, which `packages/*` already matches,
   so no workspace edit is needed and no swarm blocks on the coordinator. Do not
   nest them.
2. **Classification is pre-registered for you.** `KNOWN_PACKAGE_PATHS` in
   `packages/conformance/src/boundaries.ts` is Swarm C's file, and C registers
   all four manifest paths as part of its own deliverable. The set is not
   asserted against the filesystem, so registering a path before the package
   exists is safe and is what makes E–H independent of C. If you are E–H and the
   boundary gate throws `unknown import source|target` naming your package, C's
   registration has not landed — say so in your handback rather than editing C's
   file.

### 0.7 Scope discipline

Do exactly your swarm's deliverable. If you find a defect outside your file
ownership, **report it in your handback; do not fix it.** Two agents editing one
file is the failure mode this partition exists to prevent.

If your deliverable turns out to be wrong, impossible, or already done, stop and
say so. A swarm that reports "this premise is false, here is the evidence" has
succeeded. One that invents work to look productive has not.

### 0.8 Handback format

Write `.sdlc/report-<swarm-id>.json`:

```json
{
  "swarm": "A",
  "status": "complete | blocked | premise-false",
  "filesOwned": ["..."],
  "filesTouched": ["..."],
  "falsification": [
    {"test": "name", "brokeBy": "what I changed", "observedFailure": "message", "restoredAndPassed": true}
  ],
  "gates": {"biome": "0/0", "build": "126/126", "tests": "N/N"},
  "claimsCorrected": ["inherited claim X was wrong because Y"],
  "foundOutsideScope": ["..."],
  "openQuestions": ["..."]
}
```

---

## 1. How this work has already failed

An adversarial reading of the session that produced this plan. These are not
hypotheticals; each one shipped or nearly shipped.

### 1.1 A false security finding, published

**Claimed:** `provider-vercel` admitted
`https://api.vercel.com/v9/projects/%2e%2e/user/tokens` — prefix matches, then
climbs into the token surface with a credential attached.

**Reality:** WHATWG URL parsing resolves dot segments *during parsing* and
treats `%2e` as a dot. That URL's pathname is `/v9/user/tokens` before any check
runs. It does not start with `/v9/projects/`. The old prefix check refused it
unaided. The headline example was never a hole.

**Why it survived review:** the regression test asserted a pattern the ordinary
prefix-refusal message also matched.

**What is actually true, and still worth having:** `%2f` and `%5c` are not
separators to the parser. `/v9/projects/%2f%2e%2e%2fv3/user/tokens/abc` and
`/v9/projects/..%5cadmin` reach the prefix check with the prefix *intact*, pass
it, and are decoded only by the origin. Both were admitted.

**Lesson for you:** when you claim a security property, produce the measurement.
`new URL(u).pathname` for each candidate, printed. Not an argument.

### 1.2 "Unobtainable" was untested

`runtime-celld`'s live lane was declared blocked because the binary "could not
be obtained" — generalised from a single GitHub *API* 403. Never tested: the
release download URL (works for other repos in this environment) or the OCI
image the version pin already names.

The pinned image **is** reachable. `ghcr.io/denoland/celld` issues a pull token
and returns the manifest for the pinned digest with HTTP 200.

**Lesson:** "blocked" is a claim about every path, and you have tested one.

### 1.3 A count taken on faith

"Eight of twelve provider transports carry their own copy of the guard" was
inherited from a PR body and repeated. Reading the code: six shared the guard's
shape, `provider-browser-wasm` enforces same-origin (different semantics), and
`provider-kafka`'s `transport.ts` is a broker seam with no HTTP guard at all.

Worse, "consolidate the eight" was an actively harmful target: three of the
remainder hold a property core's policy does not model, so hitting the number
would have meant deleting a security property to satisfy a count.

**Lesson:** a number in prose is a hypothesis.

### 1.4 A self-inflicted corruption that looked like a merge defect

Processes were SIGKILLed to free memory while `tsc` was mid-write. One output
file landed zero-length. Turbo cached the build as successful. Every subsequent
build restored the zero-length file. The symptom was 19 test failures across
launcher, sidecar and session suites in a package that had nothing to do with
it, and the first hypothesis was "the merge broke something".

**Lesson:** before blaming a diff for a broad, incoherent failure pattern, check
for a zero-length artifact: `find packages/*/dist -name '*.js' -size 0`.

### 1.5 A guard change that may have traded safety for tidiness — **re-examine this**

The banked-edge allowlist in `packages/conformance/src/boundaries.ts` was
reduced from 31 entries to 14. The 17 removed all named a target that
`CONTRACT_PACKAGE_PATHS` already classifies as `contract`, which the adapter
rule exempts outright, so removing them changed no verdict — verified: empty
violation set before and after.

**The adversarial reading, which was not addressed:** those entries were also
*documentation* and a second line of defence. If someone later removes a package
from `CONTRACT_PACKAGE_PATHS` — a one-line edit with no obvious blast radius —
seventeen provider edges become violations at once, with no allowlist entry and
no comment explaining that they were once considered fine. The reduction may
have removed a tripwire.

**This is Swarm C's problem to settle**, and settling it is not automatic
agreement. See §C.

### 1.6 Formatter churn disguised as a diff

A 13-line addition to `turbo.json` was written by round-tripping the file
through `json.dump`, producing 156 changed lines. It passed every gate. It was
caught only by reading the diff. **Read your own diff before committing** —
`git diff --stat` then `git diff`. Churn is a review tax you are levying on
someone else.

---

## 2. Current state — verified, not remembered

Trunk is `bdd83e1b`. At that commit:

| Gate | State |
|---|---|
| `npx biome check .` | 0 errors, 0 warnings, 2,467 files |
| `npx tsx scripts/check-package-boundaries.mts` | `"violations":[]` |
| `turbo run build` | 126/126 |
| `docs:okf`, `docs:design-lint`, `standards:check`, `skills:mirror-check` | pass |
| `turbo run test` | one known-red package: `@hobo/runtime-celld` |

`@hobo/runtime-celld` fails because the live lane needs a binary that is not on
disk. That is Swarm A's deliverable. **Nothing else on trunk is known-red.** If
your swarm's work makes something else red, you caused it.

The transport guard currently stands as:

- **Delegating to `@hobo/core`'s `guardTransport` + `assertAllowedEndpoint`:**
  `provider-vercel`, `provider-netlify`, `provider-neon`, `provider-ttl-sh`,
  plus `aws`, `azure`, `gcp`, `cloudflare` (verified: all four call
  `guardTransport`).
- **Sharing only the `encodesPathSeparator` predicate, with their own guards:**
  `provider-upstash` (suffix host matching, `.upstash.io`),
  `provider-kubernetes` (`allowInsecureLoopback`), `provider-browser-wasm`
  (same-origin + `allowInsecureLocalhost`).
- **Not an HTTP transport:** `provider-kafka`.

### What A and C found that this document got wrong

Recorded here rather than edited into the briefs, because §0.4 asks every swarm
to verify what it inherits and these are the payoff.

- **A.** The lane was blocked on *two* things, not one. With the binary
  installed and nothing else changed, 3 of 11 tests still failed: the
  `CELLD_ESBUILD` default pointed at an arm64 path inside another agent's home
  directory, and `celld deploy` exits 1 with "esbuild not found". The brief
  claimed a single missing binary. Also: the image index entry order is amd64,
  attestation, arm64, attestation — not the amd64/arm64/unknown/unknown the
  brief described, which is why platform selection is by `platform.os` /
  `platform.architecture` and an explicit `vnd.docker.reference.type` rejection
  rather than by position.
- **C1.** The brief's mechanism was backwards. Declassifying `packages/bindings`
  against the real graph produces **18** violations with the 17 allowlist
  entries deleted and **6** with them restored: the allowlist does not warn
  about a reclassification, it *absorbs* one. What was actually lost when the
  entries went is the written record of why those edges were acceptable, so the
  test pins the reason (`classifyPackage(to).kind === "contract"`) rather than
  the list. The inherited "seventeen become violations at once" is also wrong —
  the 17 span four targets.
- **C2.** The predicted second-edge mechanism does not happen: `main()`
  deduplicated on `from->to`, so the unmarked edge won **by position**, and the
  declared scan happening to be spread in before the source scan is what made
  the refusal fire at all. Two lines apart in one array literal, with nothing
  testing it. `mergeWorkspaceEdges` now takes the strictest provenance in either
  order.
- **C4.** 5 of the 14 banked edges are not runtime edges at all —
  `provider-agentv`, `provider-ax` and `runner-depot` import nothing but
  `@hobo/core` from `src/`, and `pack-framework/src`'s two `@hobo/cloud`
  occurrences are prose in doc comments. Two committed source comments were
  false; ADR-0162 corrects them.

### The build graph changed underneath all of this

`turbo run test` used to run a second, uncached build graph beneath the cached
one: 47 packages carried `"prebuild": "pnpm --filter <dep> build"` and 100
carried a `pretest` that rebuilt themselves and their dependencies, so a full
sweep paid roughly 150 cold `tsc` invocations that turbo had already done. Those
are gone; packages that need their own dist outside turbo call
`scripts/ensure-built.mts`, and `pnpm run standards:check` fails the tree if one
comes back. `tasks.build.inputs` now excludes test material, so editing a test
no longer invalidates 124 builds and everything downstream. See AGENTS.md,
"One build graph, not two" — **do not reintroduce a dependency build in a
package script.**

---

## 3. Swarm partition

**File ownership is exclusive.** No two swarms may write the same file. If your
work seems to require a file another swarm owns, that is a finding for your
handback, not a licence.

**All nine swarms have landed, plus a tenth the work uncovered.** Their briefs
stay below as the record of what was asked and what the acceptance bar was; §2
records what each actually found. Every single swarm returned at least one place
where its brief was materially wrong — read §0.4 as the load-bearing rule it
turned out to be, not a formality.

| Swarm | Status | Deliverable | Owns |
|---|---|---|---|
| **A** | **done** | celld live lane green | `packages/runtimes/runtime-celld/**`, `scripts/fetch-celld.mts` |
| **B** | **done** — `premise-false`, one third delivered | Transport policy extension; last three transports fully on the shared guard | `packages/core/src/ports/http-transport.ts`, `packages/core/test/http-transport.test.ts`, `packages/providers/provider-{upstash,kubernetes,browser-wasm}/**` |
| **C** | **done** | Boundary-guard hardening + the tiering ADR | `packages/conformance/src/boundaries.ts`, `packages/conformance/test/boundaries.test.ts`, `scripts/check-package-boundaries.mts`, `scripts/test/check-package-boundaries.test.ts`, `docs/design/adr/**` |
| **D** | **done** — tier-bounded, remainder recorded | Assertion-strength sweep | every `**/test/**` and `**/contracts/**` test file **except** those owned by A, B, **C**, E–I |
| **E** | **done** | `@hobo/manifest-capability` | `packages/manifest-capability/**` |
| **F** | **done** | `@hobo/manifest-request` | `packages/manifest-request/**` |
| **G** | **done** | `@hobo/manifest-declaration` | `packages/manifest-declaration/**` |
| **H** | **done** | `@hobo/manifest-plan` | `packages/manifest-plan/**` |
| **I** | **done** — plan shapes deliberately not re-exported | Re-export wiring + round-trip proof across all four manifests | `packages/capability-profiles/src/index.ts`, `packages/cloud/src/plan-types.ts`, `packages/manifest-round-trip/**` |

| **J** | **done** — not in the original plan | CUE schema integrity + the gate that missed it | `**/*.cue`, `scripts/check-cue-schemas.ts` |

**Swarm J was not planned.** It exists because three separate swarms reported
that `cue vet` never runs. That inference was wrong — the binary is cached at
`.tools/cue/v0.14.0/cue` — but chasing it down found something worse: fixture
vetting is gated on `data-models/buf.yaml`, which **16 of 191** directories
have, and 46 committed `.cue` files did not parse at all. Treat a swarm's
*wrong* diagnosis as a lead, not as noise.

**Swarms B and D–H ran fully in parallel.** Swarm I consumed E–H's published
schemas — specified in §5 of this document, so I did not wait on E–H to *design*
anything.

`pnpm-workspace.yaml`, `pnpm-lock.yaml`, `AGENTS.md`, and
`docs/design/traceability.md` are **coordinator-owned**. Report needed changes
in your handback as a delta; do not edit them. This is a hard rule — these files
are where parallel edits corrupt silently.

---

## 4. Swarm briefs

### Swarm A — celld live lane

**Problem.** `packages/runtimes/runtime-celld/test/live-*.test.ts` requires a
`celld` binary at `CELLD_BIN` (default `/tmp/hobo-live/bin/celld`). The tests
fail rather than skip when it is absent — deliberate policy, stated in the
package README: *"A missing binary is a failure, not a skip."* Preserve that.
Do not make these tests skip.

**The binary is obtainable.** `packages/runtimes/runtime-celld/src/upstream-pin.ts`
pins:

```
source:    https://github.com/denoland/celld/releases/tag/v0.2.1
pinnedRef: ghcr.io/denoland/celld:v0.2.1@sha256:7a4380721b6400073f2a26afe70a828410169f658d31b5ef61383e648ca0c530
```

Release *assets* under that tag return 404. The **OCI image resolves**:

```bash
T=$(curl -sS "https://ghcr.io/token?scope=repository:denoland/celld:pull&service=ghcr.io" \
      | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')
curl -sS -H "Authorization: Bearer $T" \
  -H "Accept: application/vnd.oci.image.index.v1+json,application/vnd.oci.image.manifest.v1+json" \
  "https://ghcr.io/v2/denoland/celld/manifests/sha256:7a4380721b6400073f2a26afe70a828410169f658d31b5ef61383e648ca0c530"
```

returns HTTP 200 and an OCI image index. Walk index → per-platform manifest →
layers, pull each layer blob from `/v2/denoland/celld/blobs/<digest>`, untar,
and locate the `celld` executable.

The index was resolved while writing this brief and contains **four** entries:

```
linux/amd64        sha256:8634eac20f69ffe9910…
linux/arm64        sha256:27732fa9bdb243adec7…
unknown/unknown    sha256:1a504b34123fa53b86a…
unknown/unknown    sha256:62accb1efd72b9888d8…
```

The two `unknown/unknown` entries are attestation manifests, not images. Select
by `platform.os === "linux"` and `platform.architecture` matching the host —
do not index into the array positionally, and do not try to extract a binary
from an attestation. Handle both amd64 and arm64; this environment is x86_64
but the repo's own notes record an aarch64 host elsewhere.

**Deliverable.**

1. `scripts/fetch-celld.mts` — resolves the pin, downloads, extracts, and
   installs to `CELLD_BIN` (honouring the env var, defaulting as the tests do).
2. It **must verify the digest it was given** before executing anything. This
   script downloads a binary and the test suite runs it. Compute the sha256 of
   each blob and compare to the digest the manifest declares; refuse on
   mismatch. Do not skip this because ghcr is "trusted" — the pin exists so that
   trust is checkable.
3. On TLS failure, report actionably: name the URL and, on a chain rejection,
   name `NODE_EXTRA_CA_CERTS`. Do not disable verification.
4. `packages/runtimes/runtime-celld` tests pass with the binary installed.

**Falsification.** Corrupt one byte of a downloaded blob and show the digest
check refuses. Point `CELLD_BIN` at a stub and show the tests fail on the stub's
*behaviour* (not on the missing-binary guard) — that distinction is how you know
the escape hatch works.

**If the image turns out not to contain a usable linux/amd64 binary**, that is a
legitimate `premise-false` handback. Report the manifest platforms you found.
Do not fabricate a stub and call the lane green.

---

### Swarm B — transport policy extension

**Problem.** Three transports cannot use `guardTransport` because
`TransportGuardPolicy` cannot express what they need. They currently share only
the `encodesPathSeparator` predicate. Each therefore maintains its own
https/host/prefix/redirect/cap logic — the same divergence that produced §1.1.

**Extend the policy** in `packages/core/src/ports/http-transport.ts`:

- `allowedHostSuffixes?: readonly string[]` — a host matches if it equals an
  entry in `allowedHosts` **or** ends with an entry here. Suffixes must begin
  with `.` and contain at least one further dot; reject `".com"` and `"upstash.io"`
  at policy-parse time. A suffix that does not start with `.` would match
  `evilupstash.io`, so this validation is load-bearing, not hygiene.
- `allowInsecureLoopback?: boolean` — permits `http:` **only** when the hostname
  is `127.0.0.1`, `[::1]`, or `localhost`. Any other host stays https-only.
- `requireSameOrigin?: string` — when set, the URL's `origin` must equal this
  value exactly. Composes with the above rather than replacing them.

All three default to off. An unset policy behaves exactly as today — assert
that with a test over the existing policies.

**Then migrate** `provider-upstash`, `provider-kubernetes`,
`provider-browser-wasm` to `guardTransport`, each keeping its own error type by
translating `TransportGuardError` at the boundary, exactly as `provider-vercel`
does (read it first — it is the reference implementation). Preserve every
exported name, error code, and policy constant. The existing tests are your
contract: they must pass **unmodified** except where you are adding to them.

**Falsification.** For each of the three: show a host that the suffix rule must
reject (`evilupstash.io` against `.upstash.io`), show loopback http admitted and
non-loopback http refused under `allowInsecureLoopback`, show a cross-origin
asset refused under `requireSameOrigin`. Then delete each new policy field's
enforcement and show the corresponding test fails.

**Specify and test how the three options interact**, because unspecified
interaction is where a guard grows a hole. At minimum: a suffix match *and*
`allowInsecureLoopback` both set — does `http://evil.upstash.io` pass? (It must
not: loopback is a hostname test, not a scheme waiver.) And `requireSameOrigin`
together with `allowedHosts` — the same-origin check is an additional
constraint, never a replacement. Write the matrix as a table test.

**You are permitted to conclude this extension is a bad idea.** §1.3 records
that "consolidate the eight" was an actively harmful target because three
transports hold properties core's policy does not model. The premise here is
that *extending* the policy removes that objection — but if the extension turns
`TransportGuardPolicy` into three optional modes that interact in ways nobody
can hold in their head, then three small explicit guards were the better design
and consolidating them is the same mistake wearing a nicer hat. If you reach
that conclusion, return `premise-false` with the policy shape you would have had
to write. That is a real result, not a failure to deliver.

**Do not** add `NODE_TLS_REJECT_UNAUTHORIZED` or any option that disables
verification.

---

### Swarm C — boundary-guard hardening and the tiering ADR

Three deliverables, all in your owned files.

**C1 — settle §1.5.** The banked list went 31 → 14 by deleting entries the
`contract`-kind exemption already covered. Decide, with evidence, whether that
removed a tripwire. Two defensible outcomes:

- Add a test that pins the *reason*: for each of the 17 removed edges, assert
  the target is in `CONTRACT_PACKAGE_PATHS`. Reclassifying a package then fails
  a named test that explains itself, instead of producing seventeen mysterious
  violations. This restores the tripwire without restoring the allowlist.
- Or demonstrate the concern is unfounded and say why.

Pick one. Do not split the difference.

**C2 — prove the dev-marker is sound.** `WorkspaceEdge.dev` marks edges that
exist only via `devDependencies`, and the harness exemption keys on it. The
untested hole: a package that lists `@hobo/contract-harness` in
`devDependencies` **and imports it from `src/`**. The declared-edge collector
marks that dev; the source scanner (which walks `src/` only) should produce a
second, unmarked edge that still fails. Verify this actually happens and pin it
with a test. If it does not happen, that is a real vulnerability in the guard —
fix it and say so.

**C3 — pre-register the four manifest packages.** Add
`packages/manifest-capability`, `packages/manifest-request`,
`packages/manifest-declaration` and `packages/manifest-plan` to
`KNOWN_PACKAGE_PATHS`. Do this **first**, before your other deliverables, and
independently of whether those packages exist yet — the set is not asserted
against the filesystem, and this registration is what lets Swarms E–H run in
parallel with you instead of blocking on you.

Then decide whether they belong in `CONTRACT_PACKAGE_PATHS`. They are schema
packages that other packages implement against, which is what that set is for —
but decide it, do not assume it, and record the reasoning. The classification
determines whether a provider may import them directly, so getting it wrong in
the permissive direction silently widens what the adapter rule allows.

**C4 — write the ADR the 14 remaining banked edges defer to.** They fall into
groups with distinct justifications, each already commented in the source:
runner-tier composition (`runner-blacksmith`/`runner-depot` → `runner-github`),
policy-engine adapters → `@hobo/contracts`, `adapter-openbao` → `@hobo/identity`,
`provider-agentv` → `@hobo/training-pipeline`, `provider-ax` → `@hobo/runtime`,
`pack-framework` → `@hobo/cloud`, `provider-convex` → `@hobo/sdk`, and the
ADR-0135-sanctioned runtime → `storage-sqlite` edges.

The ADR must answer: **is "a tier base library" a legitimate architectural
concept in this repo, or is each of these a package that should have lifted its
shared vocabulary into `@hobo/core`?** Decide per group. An ADR that says "these
are all fine" without distinguishing them is not an answer. Follow the existing
ADR format in `docs/design/adr/`; the coordinator will handle
`docs/design/traceability.md`.

---

### Swarm D — assertion-strength sweep

**Problem.** §0.3 and §1.1. Weak assertions have hidden real defects here.

Find, across every test file **not owned by another swarm**:

1. `assert.throws(fn)` and `assert.rejects(fn)` with no second argument.
2. `.toThrow()` / `.rejects.toThrow()` with no argument.
3. `.toThrow(/…|…/)` alternations loose enough to match a *different* refusal
   from the same function — the §1.1 shape. This one needs judgment: read what
   else the function under test can throw.
4. `expect(x).toBeDefined()` / `toBeTruthy()` standing in for a real assertion
   where the value's *shape* is what matters.

For each: tighten to the specific refusal, then **falsify it** — break the code
path, watch that exact test fail, restore.

Report a table: file, line, what it asserted before, what it asserts now, and
what the falsification showed. **Where tightening reveals a test that never
tested anything, say so loudly** — that is the highest-value output of this
swarm, and it has already happened three times in this repo.

**Bound the sweep by risk, not by file count.** The repo has on the order of
1,600 test files; sweeping all of them uniformly is neither achievable in one
pass nor useful. Work outward from where a weak assertion actually costs
something:

1. Anything asserting a **refusal** — guards, policy checks, credential custody,
   boundary and conformance rules. A weak assertion here is how the §1.1 finding
   got published.
2. Contract and PACT tests, where a loose matcher lets a real protocol change
   through.
3. Everything else, if there is room.

Start with:

```bash
grep -rn 'assert\.throws([^,)]*)$\|\.toThrow()' --include='*.test.ts' packages/ | head -50
grep -rn '\.toThrow(/[^/]*|' --include='*.test.ts' packages/ | head -50
```

Report what you did **not** get to, by tier. A truthful "tier 3 untouched" is
worth more than a claim of full coverage nobody can check.

Do not change production code. If tightening an assertion reveals a production
defect, report it; do not fix it.

---

### Swarms E–H — the four manifest packages

One package each, identical shape, no shared files. **The schemas are specified
in §5** so all four proceed immediately and in parallel.

Each package must contain:

- `data-models/<name>.proto` and `data-models/<name>.cue` — the schema is the
  contract; the TypeScript is generated from or validated against it, per the
  repo's protobuf + CUE rule in `AGENTS.md`.
- `src/index.ts` — parse-don't-validate: a `parseX` returning a branded type or
  throwing a named error. Follow `packages/capability-profiles/src/requirement.ts`
  for the existing idiom; read it before designing yours.
- `package.json` with `@hobo/core` as its only workspace dependency. A manifest
  package that depends on another manifest package is a design error — report
  it rather than adding the edge.
- `test/` with a conformance suite **and** a round-trip test over the *existing*
  fixtures named in §5 for your shape. Byte-identical where a digest is
  involved. This is the point of the exercise: if a current value cannot survive
  a round trip through your schema, the schema is wrong, and finding that is
  your deliverable — not a failure.
- `contracts/` — **required**, not conditional. `pnpm run konsistent` enforces
  `production-package-scaffolding`: every production package under `packages/`
  must have `test/`, `contracts/` **and** `data-models/` as directories, and it
  reports a named error per missing one. If your shape genuinely crosses no
  service boundary, write a `contracts/README.md` saying so and why — an
  invented PACT to satisfy a scaffolding rule is worse than an honest note.
  Add `konsistent` to your gate list; §6 does not list it and should.

**The most valuable outcome any of E–H can produce is a shape that does not
round-trip.** Report it precisely: which field, which fixture, what is lost. Do
not widen the schema to `any` to make a test pass.

---

### Swarm I — re-export wiring and the ResourceIntent question

**Deliverable.** Existing packages re-export from the new manifest packages so
no consumer changes: `packages/capability-profiles/src/index.ts` re-exports the
capability and request shapes; `packages/cloud/src/plan-types.ts` re-exports the
declaration and plan shapes. Nothing outside these two files changes. Verify
with a full `turbo run build` — 126/126, zero TS errors.

**And answer the open question the decomposition plan says must be settled:**

> **Does `ResourceIntent` survive?** It overlaps `CapabilityRequirement`
> heavily. Either it becomes a projection of the request manifest, or it is a
> fourth shape that needs its own justification.

Answer it **empirically**, with a round-trip test, not by argument:

- If every `ResourceIntent` in the existing fixtures is expressible as a
  projection of the request manifest with no loss, say so and show the
  projection function.
- If any field survives that the request manifest cannot carry, name it, and
  `ResourceIntent` stays a distinct shape with that field as its justification.

Write the answer into `packages/manifest-round-trip/README.md` with the
evidence. This decision propagates through the rest of the decomposition, so an
unevidenced answer is worse than none.

---

## 5. Schemas — build against these

Source of truth for the current shapes:

| Shape | Current location | Manifest package |
|---|---|---|
| `CapabilityRequirement` | `packages/capability-profiles/src/requirement.ts` | E — `manifest-capability` |
| `STANDARD_CAPABILITY_PROFILES` | `packages/capability-profiles/src/standard-profiles.ts` | E — `manifest-capability` |
| `SelectionCandidate` | `packages/capability-profiles/src/selection.ts` | F — `manifest-request` |
| `ResourceIntent` | `packages/cloud/src/plan-types.ts` | G — `manifest-declaration` |
| `ResourcePlan` | `packages/cloud/src/plan-types.ts` | H — `manifest-plan` |

**Read the current TypeScript definition before writing your schema.** It is the
specification. Your `.proto`/`.cue` must express every field it has, including
optionality — note `exactOptionalPropertyTypes: true` and
`noUncheckedIndexedAccess: true` in `tsconfig.base.json`, which mean an optional
field and a field that may be `undefined` are different things and your schema
must not conflate them.

**Round-trip fixtures.** Use the existing fixtures already in the repo rather
than inventing new ones — inventing them is how a schema passes its own test
while failing on real data. Find them under each owning package's `test/` and
`contracts/` directories, and under `packages/recipes/test/golden/` for
digest-bearing cases. Where a digest is involved the round trip must be
**byte-identical**, because those digests are compared across packages.

---

## 6. Gates every swarm runs before handback

```bash
cd /home/user/HoBo
NODE_OPTIONS= npx biome check .                                    # 0 errors, 0 warnings
NODE_OPTIONS= npx tsx scripts/check-package-boundaries.mts         # "violations":[]
NODE_OPTIONS= npx turbo run build --concurrency=100%               # 130/130
NODE_OPTIONS= npx turbo run test --concurrency=100% --filter=<your packages>
NODE_OPTIONS= pnpm run standards:check                             # public-contract markers
NODE_OPTIONS= pnpm run konsistent                                  # package scaffolding
NODE_OPTIONS= pnpm run docs:okf                                    # frontmatter on new design docs
```

**`--concurrency=100%` is not optional and `TURBO_CONCURRENCY=2` is obsolete.**
Turbo's default of 10 concurrent tasks OOM-kills a fully cold sweep on a
four-core, 16 GB box — `SIGKILL`, exit 137, which reads like a failing test and
is not one. One task per logical CPU is measurably free: on a fixed 224-task set
concurrency 4 and concurrency 10 finish within noise of each other. Every turbo
invocation the repo owns already carries the flag; yours must too.

Three gates that have bitten repeatedly:

- **`konsistent`** enforces `production-package-scaffolding` — `test/`,
  `contracts/` and `data-models/` must all exist as directories in every
  production package. It is not in the list above by accident; it was added
  after four new packages tripped it at once.

- **`standards:check`** requires a `// public-contract: <why>` marker on every
  exported string-literal constant under `packages/*/src/`, each with its own
  reason. New manifest packages will trip this immediately.
- **`docs:freshness`** requires a documentation change alongside code changes.
  Write the doc that belongs with your work; do not add a token line to satisfy
  it. If the honest documentation change is a *correction* to something already
  written, make it — that has been the right answer more than once here.

Never bypass hooks. **Read your own diff before committing** (§1.6).

---

## 7. What "done" means

Trunk ends with: `biome` 0/0, `check-package-boundaries` empty, `turbo run build`
green, `turbo run test` green **including `@hobo/runtime-celld`**, and every new
test demonstrated able to fail.

Plus the three questions answered with evidence rather than opinion: whether the
banked-list reduction removed a tripwire (C1), whether the dev-marker has a hole
(C2), and whether `ResourceIntent` survives (I).

A swarm that returns `premise-false` with evidence has done its job. A swarm
that returns green gates it did not run has not, and the falsification records
in the handback are how that gets caught.
