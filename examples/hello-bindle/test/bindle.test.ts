import { describe, expect, it } from "vitest";

import { app as helloApi } from "../src/api.js";
import definition from "../src/bindle.js";

describe("hello-bindle", () => {
	it("wires a web app that depends on the api", () => {
		expect(Object.keys(definition.resources)).toEqual(["api", "web"]);
		expect(definition.edges).toEqual([{ from: "web", to: "api" }]);
	});

	it("binds the Hono api handler to the api resource", async () => {
		const boundApi = definition.entrypoint("api");
		expect(boundApi).toBeTypeOf("function");

		const fetch = boundApi?.() as typeof helloApi.fetch;
		const response = await fetch(new Request("http://hello-bindle.test/hello"));

		expect(await response.json()).toEqual({ message: "hello, world" });
	});

	it("serves a greeting from the api", async () => {
		const response = await helloApi.request("/hello?name=HoBo");
		expect(await response.json()).toEqual({ message: "hello, HoBo" });
	});
});
