import { bindle } from "@hobo/bindles";

export const runtime = {
	schemaVersion: "hobo.try-runtime/v1",
	resources: { todos: { kind: "kv", initial: [] } },
	routes: [
		{ method: "GET", path: "/health", action: "health" },
		{ method: "GET", path: "/api/todos", action: "list", resource: "todos" },
		{ method: "POST", path: "/api/todos", action: "create", resource: "todos" },
		{ method: "PATCH", path: "/api/todos/:id", action: "toggle", resource: "todos" },
	],
} as const;

export default bindle(
	"todo-api",
	{ require: ["http", "kv"], runtimes: ["wasm"] },
	(b) => {
		const todos = b.kv().allow("get", "set");
		const api = b.api().dependsOn(todos);
		return { todos, api };
	},
);
