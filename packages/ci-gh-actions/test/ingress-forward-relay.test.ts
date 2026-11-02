import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { signIngressForward } from "../src/ingress-forward.js";
import { createRelayRequestHandler } from "../src/server.js";
import { Relay } from "../src/relay.js";
import { SECRET, harness } from "./fixtures.js";

describe("relay ingress forward intake", () => {
	it("accepts x-hobo-ingress-forward without github signature", async () => {
		const ingressSecret = "ingress-forward-secret-32-characters!!";
		const base = harness();
		const relay = new Relay({
			...base.relay.options,
			ingressForwardSecret: ingressSecret,
		});
		const server = createServer(createRelayRequestHandler(relay));
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		if (!address || typeof address === "string")
			throw new Error("missing listen address");
		const body = Buffer.from(
			JSON.stringify({
				action: "queued",
				installation: { id: 1 },
				repository: { id: 1, full_name: "acme/repo" },
				workflow_job: { id: 99, run_id: 1, labels: ["hobo"] },
			}),
		);
		const forward = signIngressForward(ingressSecret, body);
		try {
			const response = await fetch(
				`http://127.0.0.1:${address.port}/github/webhooks`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-github-event": "workflow_job",
						"x-hobo-ingress-forward": forward,
					},
					body,
				},
			);
			expect(response.status).toBe(202);
		} finally {
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
		}
	});

	it("still requires github signature without ingress forward header", async () => {
		const { relay } = harness();
		const server = createServer(createRelayRequestHandler(relay));
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		if (!address || typeof address === "string")
			throw new Error("missing listen address");
		try {
			const response = await fetch(
				`http://127.0.0.1:${address.port}/github/webhooks`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-github-event": "workflow_job",
					},
					body: "{}",
				},
			);
			expect(response.status).toBe(401);
		} finally {
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
		}
		expect(SECRET.length).toBeGreaterThan(31);
	});
});
