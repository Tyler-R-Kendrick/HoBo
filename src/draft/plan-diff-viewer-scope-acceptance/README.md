# Plan/Diff Viewer Scope Acceptance POC

HOBO-411 proof for Plan/Diff Viewer M0 scope and acceptance.

The package exports a machine-checkable record in `src/plan-diff-viewer-scope.mjs` and validates
that:

- goal, personas, scope, non-goals, and service/UX/security/support boundaries are explicit;
- dependencies map to authoritative design and ADR sources;
- owning initiative dependencies are named without taking dashboard, onboarding, security, support,
  or release-cutline scope;
- M1 proof evidence has owner, source, proof mode, and assertion;
- M1-M4 follow-up issues are blocked until M0 acceptance;
- scope creep into planner/apply, production dashboard, live-provider, or credential behavior is
  rejected.

Run:

```powershell
npm.cmd --prefix src\draft\plan-diff-viewer-scope-acceptance test
```
