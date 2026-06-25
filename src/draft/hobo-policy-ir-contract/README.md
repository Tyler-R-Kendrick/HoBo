# HoBo Policy IR contract POC

HOBO-91 pins the v1 request and decision shape used by every policy gate:
agent actions, deploy promotion, runtime authorization, live-fix, training, and
control-plane governance.

This POC defines:

- `DecisionRequest` validation for `subject`, `action`, `resource`, `phase`,
  and arbitrary JSON `context`.
- `Decision` validation for rich effects, durable obligations, and replay
  evidence.
- Canonical JSON hashing for `evidence.inputHash`, independent of object field
  order.
- `policy.Decided` event payload creation.
- JSON schema and WIT-record-style decision encoding.
- A typed v0-to-v1 request migration seam.

Scope intentionally stops at the IR. It does not implement a policy engine,
obligation execution, deny-ceiling algebra, or contract IR.
