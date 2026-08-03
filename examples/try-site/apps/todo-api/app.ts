import { bindle } from "@hobo/bindles";

export default bindle(
	"todo-api",
	{ require: ["http", "kv"], runtimes: ["wasm"] },
	(b) => {
		const todos = b.kv().allow("get", "set");
		const api = b.api().dependsOn(todos);
		return { todos, api };
	},
);
