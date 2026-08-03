import { bindle } from "@hobo/bindles";

export const runtime = {
	schemaVersion: "hobo.try-runtime/v1",
	resources: { notes: { kind: "kv", initial: [] } },
	routes: [
		{ method: "GET", path: "/health", action: "health" },
		{ method: "GET", path: "/api/notes", action: "list", resource: "notes" },
		{ method: "POST", path: "/api/notes", action: "create", resource: "notes" },
		{ method: "DELETE", path: "/api/notes/:id", action: "delete", resource: "notes" },
	],
} as const;

export default bindle(
	"kv-notes",
	{ require: ["http", "kv"], runtimes: ["wasm"] },
	(b) => {
		const notes = b.kv().allow("get", "set", "delete");
		const web = b.web().dependsOn(notes);
		return { notes, web };
	},
);
