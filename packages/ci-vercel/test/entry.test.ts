import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { config } from "../api/relay.js";
import { createHttpEntry } from "../src/entry.js";

describe("Vercel HTTP entrypoint", () => {
	it("disables body parsing and forwards the original request path", async () => {
		expect(config.api.bodyParser).toBe(false);
		const server = createServer(
			createHttpEntry(async () => ({
				origin: "https://relay.example",
				handle: async (request: Request) =>
					new Response(new URL(request.url).pathname),
			})),
		);
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		try {
			const port = z.object({ port: z.number() }).parse(server.address()).port;
			const response = await fetch(`http://127.0.0.1:${port}/github/webhooks`);
			expect(await response.text()).toBe("/github/webhooks");
		} finally {
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
		}
	});
});

it("preserves distinct Set-Cookie headers through the Node adapter", async () => {
	const server = createServer(
		createHttpEntry(async () => ({
			origin: "https://relay.example",
			handle: async () => {
				const headers = new Headers();
				headers.append("set-cookie", "session=one; Path=/; HttpOnly");
				headers.append("set-cookie", "oauth=two; Path=/; HttpOnly");
				return new Response(null, { headers });
			},
		})),
	);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const port = z.object({ port: z.number() }).parse(server.address()).port;
		const response = await fetch(`http://127.0.0.1:${port}/`);
		expect(response.headers.getSetCookie()).toEqual([
			"session=one; Path=/; HttpOnly",
			"oauth=two; Path=/; HttpOnly",
		]);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});
