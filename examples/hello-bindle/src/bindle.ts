import { bindle } from "@hobo/bindles";
import { run } from "./service.js";

export default bindle("hello-bindle", (b) => {
	const cache = b.cache();
	const api = b.api(() => run()).dependsOn(cache);
	return { cache, api };
});

/** Plan 21 hello-bindle IfC authoring surface (collection target). */
export function defineHelloBindle(collect) {
	const todos = collect.kv("todos");
	const main = collect.api("main", { bind: { todos } });

	main.route("GET", "/todos/:id", () => todos.get("todo-1"));
	main.route("POST", "/todos", () => todos.set("todo-1", { title: "ship" }));
}
