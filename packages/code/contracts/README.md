# @hobo/code contracts

Executable PACT consumer/provider evidence for the `SessionControlPlane` seam:

- isolation create/cleanup (rift preferred, worktree fallback)
- promotion as sole mutation path
- WIT guest evidence submissions stamped as unverified component claims
- generated browser-recording capabilities confined to `.hobo/recordings`, with
  stable serial/zero-retry playback commands
- durable resident-session create/detach/reattach/pane-focus semantics
- every pane in a session snapshot is backed by a non-empty runtime identifier

The generated-skill/host interaction reuses the existing parsed TypeScript
browser-recording and overlay-action boundaries; it adds no new wire record, so
no Protobuf record is duplicated here. `#GeneratedSkillName` in
`data-models/code_harness.cue` owns the slug invariant, while `parseSkillName`
produces the refined TypeScript domain value; `test/code-harness.test.ts` runs
the same valid/invalid corpus through both views. The same CUE model owns
replayable-recording completion, action-count, and same-origin constraints;
the exporter consumes only its refined TypeScript state. The package typecheck
protects that view, this PACT fixture plus the package test gate protect
consumer/provider behavior, and
`pnpm run standards:check -- --base=origin/main` protects repository policy.
`recording-capability-host.pact.json` drives the production tokenized HTTP
action in `test/session-control-server.test.ts`, including the real parser,
exporter, confined persistence path, status, headers, payload, and response.
Harness discovery is exercised separately against the persisted layout.
