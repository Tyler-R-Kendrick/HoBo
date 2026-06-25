# HoBo Runtime Primitives POC

This package proves the HOBO-13 `hobo:runtime@0.1.0` primitive contract:

- `workflow`: durable steps, sleep, event emission, hooks, run start.
- `actor`: single-writer state append and actor signal.
- `saga`: event subscription, emission, compensation.
- `agent`: durable agent run, tool call, brokered token handle.
- `command`: aggregate command execution and event append.
- `subscribe`: reactive materialization subscription and snapshot read.

The test gate runs `jco types wit --out-dir generated`, typechecks a no-op
guest stub that imports every generated interface, validates the no-op guest
import fixture, and fails closed when the SDK primitive table drifts from WIT or
a nondeterministic wall-clock/random shape appears in the replay-safe surface.
