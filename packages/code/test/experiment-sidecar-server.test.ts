import { describe, expect, it } from "vitest";
import { startExperimentSidecar } from "../src/experiment-sidecar-server.js";
import { loopbackFetchUrl } from "../src/occupancy-endpoints.js";

const checkout = {
	name: "checkout-cta",
	flag: "checkout-cta",
	variants: ["control", "treatment"],
};

describe("Station OpenExperiment sidecar", () => {
	it("hosts the real engine next to the Station and drives define/assign/expose", async () => {
		const server = await startExperimentSidecar({ port: 0 });
		try {
			expect(server.url).toMatch(/experiment\.code\..*\.hobo\.localhost/);
			expect(server.url).not.toMatch(/127\.0\.0\.1/);
			const origin = loopbackFetchUrl(server.url);
			const health = (await (await fetch(origin)).json()) as {
				name: string;
				hosting: string;
				port: string;
				live: boolean;
				fidelity: string;
				engine: string;
			};
			expect(health).toMatchObject({
				name: "experiment",
				hosting: "station",
				port: "hobo:experiment",
				live: true,
				fidelity: "real",
				engine: "OpenExperimentEngine",
			});

			const defined = (await (
				await fetch(new URL("/experiments", origin), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(checkout),
				})
			).json()) as { name: string; flag: string };
			expect(defined).toMatchObject(checkout);

			const assigned = (await (
				await fetch(new URL("/experiments/checkout-cta/assign", origin), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ targetingKey: "user-1" }),
				})
			).json()) as { variant: string; subjectKey: string };
			expect(assigned.subjectKey).toBe("user-1");
			expect(["control", "treatment"]).toContain(assigned.variant);

			const again = (await (
				await fetch(new URL("/experiments/checkout-cta/assign", origin), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ targetingKey: "user-1" }),
				})
			).json()) as { variant: string };
			expect(again.variant).toBe(assigned.variant);

			const exposed = await fetch(
				new URL("/experiments/checkout-cta/expose", origin),
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ targetingKey: "user-1" }),
				},
			);
			expect(exposed.status).toBe(200);

			const analysis = (await (
				await fetch(new URL("/experiments/checkout-cta/analyze", origin))
			).json()) as { experiment?: string } | null;
			expect(analysis).toBeTruthy();
		} finally {
			await server.close();
		}
	});

	it("rejects a definition that is not a real experiment", async () => {
		const server = await startExperimentSidecar({ port: 0 });
		try {
			const response = await fetch(
				new URL("/experiments", loopbackFetchUrl(server.url)),
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name: "nope" }),
				},
			);
			expect(response.status).toBe(400);
			const body = (await response.json()) as { ok: boolean; code?: string };
			expect(body.ok).toBe(false);
			expect(body.code).toBe("experiment-definition-invalid");
		} finally {
			await server.close();
		}
	});
});
