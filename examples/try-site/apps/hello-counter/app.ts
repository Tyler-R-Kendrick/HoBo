import { bindle } from "@hobo/bindles";

export const runtime = {
	schemaVersion: "hobo.try-runtime/v1",
	resources: { count: { kind: "kv", initial: { count: 0 } } },
	routes: [
		{ method: "GET", path: "/health", action: "health" },
		{ method: "GET", path: "/api/count", action: "read", resource: "count", key: "count" },
		{ method: "POST", path: "/api/count", action: "increment", resource: "count", key: "count" },
		{ method: "POST", path: "/api/count/reset", action: "reset", resource: "count", key: "count" },
	],
} as const;

export default bindle(
	"hello-counter",
	{ require: ["http", "kv"], runtimes: ["wasm"] },
	(b) => {
		const count = b.kv().allow("get", "set");
		const web = b.web().dependsOn(count);
		return { count, web };
	},
);
