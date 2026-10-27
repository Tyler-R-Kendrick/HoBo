import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { z } from "zod";
import { createRelayService } from "../src/service.js";
import { harness } from "../test/fixtures.js";

const Pact = z.object({
	interactions: z.array(
		z.object({
			description: z.string(),
			providerStates: z.array(
				z.object({
					name: z.enum([
						"provider readiness unavailable",
						"provider readiness available",
					]),
				}),
			),
			request: z.object({
				method: z.string(),
				path: z.string(),
				body: z.json().optional(),
			}),
			response: z.object({ status: z.number(), body: z.json() }),
		}),
	),
});

it("verifies service readiness Pact over actual loopback HTTP with injected dependencies", async () => {
	const pact = Pact.parse(
		JSON.parse(
			readFileSync(
				new URL("./service-boundary.pact.json", import.meta.url),
				"utf8",
			),
		),
	);
	expect(pact.interactions).toHaveLength(4);
	const h = harness();
	let available = false;
	const service = createRelayService({
		relay: h.relay,
		store: h.store,
		host: "127.0.0.1",
		port: 0,
		readinessProbe: async () => available,
	});
	try {
		await service.start();
		const address = z
			.object({ port: z.number() })
			.parse(service.server.address());
		for (const interaction of pact.interactions) {
			available =
				interaction.providerStates[0]?.name === "provider readiness available";
			await service.checkReadiness();
			const init: RequestInit = { method: interaction.request.method };
			if (interaction.request.body !== undefined)
				init.body = JSON.stringify(interaction.request.body);
			const response = await fetch(
				`http://127.0.0.1:${address.port}${interaction.request.path}`,
				init,
			);
			expect(response.status, interaction.description).toBe(
				interaction.response.status,
			);
			expect(response.headers.get("cache-control")).toBe("no-store");
			expect(response.headers.get("content-type")).toBe("application/json");
			expect(await response.json()).toEqual(interaction.response.body);
		}
		expect(h.store.all()).toHaveLength(0);
	} finally {
		await service.stop();
	}
});
