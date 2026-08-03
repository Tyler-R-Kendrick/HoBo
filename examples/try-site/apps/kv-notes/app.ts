import { bindle } from "@hobo/bindles";

export default bindle(
	"kv-notes",
	{ require: ["http", "kv"], runtimes: ["wasm"] },
	(b) => {
		const notes = b.kv().allow("get", "set", "delete");
		const web = b.web().dependsOn(notes);
		return { notes, web };
	},
);
