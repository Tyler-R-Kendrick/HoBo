import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import { describe, expect, it } from "vitest";

import type { BindleDefinition } from "@hobo/bindles";
import notes, { runtime as notesRuntime } from "../apps/kv-notes/app.js";
import notesMeta from "../apps/kv-notes/meta.json" with { type: "json" };
import opensaas from "../apps/opensaas/app.js";
import opensaasMeta from "../apps/opensaas/meta.json" with { type: "json" };
import queue, { runtime as queueRuntime } from "../apps/queue-echo/app.js";
import queueMeta from "../apps/queue-echo/meta.json" with { type: "json" };
import todos, { runtime as todosRuntime } from "../apps/todo-api/app.js";
import todosMeta from "../apps/todo-api/meta.json" with { type: "json" };
import helloMeta from "../apps/hello-world/meta.json" with { type: "json" };

const examples = [
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
			if ("resource" in route && route.resource) {
				expect(app.resources[route.resource]).toBeDefined();
			}
		}
		expect(app.requirements.require).toEqual(expect.arrayContaining(meta.needs));
		expect(app.requirements.runtimes).toContain("wasm");
		expect(
			new Set(runtime.routes.map(({ method, path }) => `${method} ${path}`)).size,
		).toBe(runtime.routes.length);
	});

	it("binds hello-world trainable Hello to b.web and runs greet", async () => {
		const root = fileURLToPath(new URL("../apps/hello-world", import.meta.url));
		const appSource = await readFile(path.join(root, "app.ts"), "utf8");
		const { default: hello } = (await tsImport(
			path.join(root, "app.ts"),
			import.meta.url,
		)) as { default: BindleDefinition };
		expect(appSource).toContain("b.web(Hello)");
		expect(appSource).toContain("@trainable");
		expect(appSource).not.toContain("export const runtime");
		expect(appSource).not.toContain("require:");
		expect(hello.name).toBe("app");
		expect(hello.requirements.require).toEqual(expect.arrayContaining(helloMeta.needs));
		expect(hello.resources.web?.kind).toBe("web");
		const makeWeb = hello.entrypoint("web");
		expect(typeof makeWeb).toBe("function");
		const instance = makeWeb?.() as { greet(name?: string): string };
		expect(instance.greet()).toBe("Hello World!");
		expect(instance.greet("Bo")).toBe("Hello, Bo!");
	});

	it("packages OpenSaaS as container/service Bindle for the Wasp bridge", () => {
		expect(opensaasMeta.deployKind).toBe("local-bridge");
		expect(opensaas.requirements.require).toEqual(
			expect.arrayContaining(["http", "container"]),
		);
		expect(opensaas.requirements.runtimes).toContain("oci");
		expect(opensaas.resources.db?.kind).toBe("container");
		expect(opensaas.resources.web?.kind).toBe("service");
	});
});
