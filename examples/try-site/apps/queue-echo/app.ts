import { bindle } from "@hobo/bindles";

export default bindle(
	"queue-echo",
	{ require: ["http", "queue"], runtimes: ["wasm"] },
	(b) => {
		const messages = b.queue().allow("enqueue", "dequeue");
		const web = b.web().dependsOn(messages);
		return { messages, web };
	},
);
