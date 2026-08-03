import { describe, expect, it } from "vitest";

import counter from "../apps/hello-counter/app.js";
import counterRuntime from "../apps/hello-counter/runtime.json" with { type: "json" };
import notes from "../apps/kv-notes/app.js";
import notesRuntime from "../apps/kv-notes/runtime.json" with { type: "json" };
import queue from "../apps/queue-echo/app.js";
import queueRuntime from "../apps/queue-echo/runtime.json" with { type: "json" };
import todos from "../apps/todo-api/app.js";
import todosRuntime from "../apps/todo-api/runtime.json" with { type: "json" };

const examples = [
	[counter, counterRuntime],
	[notes, notesRuntime],
	[queue, queueRuntime],
	[todos, todosRuntime],
] as const;

describe("try-site app definitions", () => {
	it.each(examples)("keeps %s runtime capabilities aligned with its Bindle", (app, runtime) => {
		for (const [name, resource] of Object.entries(runtime.resources)) {
			expect(app.resources[name]?.kind).toBe(resource.kind);
		}
		expect(app.requirements.runtimes).toContain("wasm");
	});
});
