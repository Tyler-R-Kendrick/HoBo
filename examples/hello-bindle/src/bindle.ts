import { bindle } from "@hobo/bindles";
import { run } from "./service.js";

export default bindle("hello-bindle", (b) => {
	const cache = b.cache();
	const api = b.api(() => run()).dependsOn(cache);
	return { cache, api };
});
