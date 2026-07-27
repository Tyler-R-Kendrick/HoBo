import { afterEach, describe, expect, it } from "vitest";

import { app as api } from "../src/api.js";
import definition from "../src/bindle.js";
import { app as web } from "../src/webapp.js";

const API = "services__api__http__0";

afterEach(() => {
	delete process.env[API];
	delete process.env.GREETING_PREFIX;
	delete process.env.APP_TITLE;
});

describe("hello-bindle", () => {
	it("wires api → web with no .with annotations", () => {
		expect(Object.keys(definition.resources)).toEqual(["api", "web"]);
		expect(definition.edges).toEqual([{ from: "web", to: "api" }]);
		expect(definition.resources.api?.annotations).toEqual([]);
		expect(definition.resources.web?.annotations).toEqual([]);
	});

	it("api greets with default prefix", async () => {
		const res = await api.request("/hello?name=World");
		expect(await res.json()).toEqual({
			message: "hello, World",
			greetingPrefix: "hello",
		});
	});

	it("api respects GREETING_PREFIX when set", async () => {
		process.env.GREETING_PREFIX = "hi";
		const res = await api.request("/hello?name=X");
		expect(await res.json()).toEqual({
			message: "hi, X",
			greetingPrefix: "hi",
		});
	});

	it("web calls api via services__api__http__0", async () => {
		process.env[API] = "http://api.test/";
		const original = globalThis.fetch;
		globalThis.fetch = async (input) => {
			expect(String(input)).toBe("http://api.test/hello?name=bindle");
			return Response.json({
				message: "hello, bindle",
				greetingPrefix: "hello",
			});
		};
		try {
			const html = await (await web.request("/?name=bindle")).text();
			expect(html).toContain('data-testid="app-title">hello-bindle</h1>');
			expect(html).toContain('data-testid="greeting">hello, bindle</p>');
		} finally {
			globalThis.fetch = original;
		}
	});

	it("bindle entrypoints resolve through @hobo/adapter-hono", async () => {
		const handler = definition.entrypoint("api")?.() as typeof api.fetch;
		const body = await (
			await handler(new Request("http://local/hello?name=A"))
		).json();
		expect(body).toEqual({ message: "hello, A", greetingPrefix: "hello" });
	});
});
