# `@hobo/swe-shared`

Shared **SWE-task** session shape, sandbox access reports, and default
guardrails for vendor packages `@hobo/swe-claude`, `@hobo/swe-codex`,
`@hobo/swe-copilot`, `@hobo/swe-cursor`, `@hobo/swe-gemini`, `@hobo/swe-grok`.

Vendor packages keep **launch** (bridge binary + credential env) and
**golden transcripts** local; they re-export `runSweTask` with a fixed
`connector` id.

## Usage

```ts
import { runSweTask, sweTaskPolicy } from "@hobo/swe-shared";

await runSweTask({
  connector: "swe-claude",
  task: { taskId: "1", instruction: "fix tests", workspace: "/ws" },
  agent: myFactory,
  principal: { id: "agent" /* … */ },
});
```
