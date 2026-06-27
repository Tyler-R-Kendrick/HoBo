# Policy-gated flag flips contract

Executable proof for HOBO-345. It composes the existing flag event contract, policy IR, built-in
policy engine, and SLO burn event shape to prove that risky `flag.Changed` commits are policy-gated
before they enter the flag stream.

Run:

```sh
npm test -- src/draft/policy-gated-flag-flips-contract/test/policy-gated-flag-flips.test.mjs
```

The proof intentionally stays out of RBAC, policy-engine implementation, SLO signal production, and
shared rollout auto-revert mechanics.
