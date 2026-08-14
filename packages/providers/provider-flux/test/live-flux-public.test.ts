import { describe, expect, it } from "vitest";

import {
	applyFluxDeploy,
	FLUX_RIVET_RUNNER_RECIPE,
	parseFluxDeploySpec,
} from "../src/index.js";

describe("flux public live probes", () => {
	it("reaches the public Flux apps API without credentials", async () => {
		const response = await fetch(
			"https://api.runonflux.io/apps/whitelistedrepositories",
		);
		expect(response.ok).toBe(true);
		const body = (await response.json()) as {
			status?: string;
			data?: unknown;
		};
		expect(body.status).toBe("success");
		expect(Array.isArray(body.data)).toBe(true);
	});

	it("reaches daemon getinfo and does not treat it as actor HA", async () => {
		const response = await fetch("https://api.runonflux.io/daemon/getinfo");
		expect(response.ok).toBe(true);
		const body = (await response.json()) as {
			status?: string;
			data?: { connections?: number };
		};
		expect(body.status).toBe("success");
		expect(typeof body.data?.connections).toBe("number");
	});

	it("still refuses to apply an actor primitive to Flux after a live probe", () => {
		expect(() =>
			parseFluxDeploySpec({
				source: "oci",
				imageDigest: "sha256:abc",
				tier: "paid-multi-instance",
				environment: "preview",
				primitives: ["actor"],
			}),
		).toThrow(/actor/);
		expect(FLUX_RIVET_RUNNER_RECIPE.runners).toBe("flux-outbound-only");
		expect(
			applyFluxDeploy(
				parseFluxDeploySpec({
					source: "git",
					tier: "community-free",
					environment: "preview",
					primitives: ["web"],
				}),
			).orbitMode,
		).toBe(true);
	});

	it("unsigned GET /apps/appregister is not a successful apply", async () => {
		let response: Response;
		try {
			response = await fetch("https://api.runonflux.io/apps/appregister", {
				signal: AbortSignal.timeout(8_000),
			});
		} catch (error) {
			throw new Error(
				`flux appregister probe failed (timeout/network is a failure): ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
		expect(response.ok).toBe(false);
		expect(response.status).toBeGreaterThanOrEqual(400);
	});
});
