import { describe, expect, it } from "vitest";

import counter, { runtime as counterRuntime } from "../apps/hello-counter/app.js";
import counterMeta from "../apps/hello-counter/meta.json" with { type: "json" };
import notes, { runtime as notesRuntime } from "../apps/kv-notes/app.js";
import notesMeta from "../apps/kv-notes/meta.json" with { type: "json" };
import queue, { runtime as queueRuntime } from "../apps/queue-echo/app.js";
import queueMeta from "../apps/queue-echo/meta.json" with { type: "json" };
import todos, { runtime as todosRuntime } from "../apps/todo-api/app.js";
import todosMeta from "../apps/todo-api/meta.json" with { type: "json" };

const examples = [
	[counter, counterMeta, counterRuntime],
	[notes, notesMeta, notesRuntime],
	[queue, queueMeta, queueRuntime],
	[todos, todosMeta, todosRuntime],
] as const;

describe("try-site app definitions", () => {
	it.each(examples)("keeps %s executable contract aligned with its Bindle", (app, meta, runtime) => {
		for (const [name, resource] of Object.entries(runtime.resources)) {
			expect(app.resources[name]?.kind).toBe(resource.kind);
		}
		for (const route of runtime.routes) {
			if ("resource" in route) {
				expect(app.resources[route.resource]).toBeDefined();
			}
		}
		expect(app.requirements.require).toEqual(expect.arrayContaining(meta.needs));
		expect(app.requirements.runtimes).toContain("wasm");
		expect(
			new Set(runtime.routes.map(({ method, path }) => `${method} ${path}`)).size,
		).toBe(runtime.routes.length);
	});
});
