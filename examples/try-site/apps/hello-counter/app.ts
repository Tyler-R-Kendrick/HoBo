import { bindle } from "@hobo/bindles";

export default bindle(
	"hello-counter",
	{ require: ["http", "kv"], runtimes: ["wasm"] },
	(b) => {
		const count = b.kv().allow("get", "set");
		const web = b.web().dependsOn(count);
		return { count, web };
	},
);
