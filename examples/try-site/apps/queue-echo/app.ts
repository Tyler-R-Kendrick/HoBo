import { bindle } from "@hobo/bindles";

export const runtime = {
	schemaVersion: "hobo.try-runtime/v1",
	resources: { messages: { kind: "queue", initial: [] } },
	routes: [
		{ method: "GET", path: "/health", action: "health" },
		{ method: "GET", path: "/api/messages", action: "read", resource: "messages" },
		{ method: "POST", path: "/api/messages", action: "enqueue", resource: "messages" },
		{ method: "POST", path: "/api/messages/drain", action: "drain", resource: "messages" },
	],
} as const;

export default bindle(
	"queue-echo",
	{ require: ["http", "queue"], runtimes: ["wasm"] },
	(b) => {
		const messages = b.queue().allow("enqueue", "dequeue");
		const web = b.web().dependsOn(messages);
		return { messages, web };
	},
);
