import { it } from "vitest";
it("import todo-api", async () => {
	const p = "/home/user/HoBo/examples/try-site/apps/todo-api/app.ts";
	try {
		const m = await import(/* @vite-ignore */ `${p}`);
		console.log("todo ok:", Object.keys(m).join(","));
	} catch (e) {
		console.log("todo FAIL:", (e as Error).message.slice(0, 120));
	}
}, 60000);
