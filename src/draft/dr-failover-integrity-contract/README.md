# HOBO-316 DR Failover Integrity Contract

This package hardens the HOBO-302 disaster-recovery failover proof with
integrity checks for split-brain, RPO honesty, deterministic replay, and
resumable interrupted failover.

Executable proof:

- package: `src/draft/dr-failover-integrity-contract`
- test command: `npm.cmd --prefix src\draft\dr-failover-integrity-contract test`

Acceptance coverage:

- stale original-owner writes are rejected by the restored Yard's higher
  `fenceToken`.
- async replica restores surface the bounded-staleness RPO window and never
  claim zero loss.
- integrity events replay from zero into one owner and one state head.
- failover interrupted after fencing resumes only the unfinished steps.

Scope boundary:

- replication transport, provider routing, bootstrap internals, and the base
  DR orchestration engine remain out of scope.
- the package consumes `disaster-recovery-failover-contract` instead of
  rebuilding the runbook/remediation path.
