import { describe, expect, it } from "vitest";

import { loadExamplesCatalog } from "./catalog.js";
import { deriveWebGuestFromBindle } from "./derive-web-guest.js";

describe("deriveWebGuestFromBindle", () => {
	it("fails closed when Bindle has no web entrypoint", async () => {
		const { bindle } = await import("@hobo/bindles");
		const definition = bindle((b) => ({ kv: b.kv() }));
		expect(() => deriveWebGuestFromBindle(definition, "")).toThrow(/no web entrypoint/);
	});

	it("embeds real Hello.greet body into guest handlers for hello-world", async () => {
		const catalog = await loadExamplesCatalog();
		const hello = catalog.find(({ id }) => id === "hello-world")!;
		expect(hello.handlersSource).toMatch(/function greet|greet\(/);
		expect(hello.handlersSource).toContain("Hello World!");
		expect(hello.handlersSource).toContain("Hello,");
		expect(hello.source).not.toContain(hello.handlersSource);
	});
});
