import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const pactDir = path.dirname(fileURLToPath(import.meta.url));

describe("token-broker consumer pact", () => {
	it("pins @hobo/ci-guard → hobo-oidc-token-broker token exchange", async () => {
		const pactPath = path.join(
			pactDir,
			"pacts",
			"ci-guard-token-broker.pact.json",
		);
		const raw = await readFile(pactPath, "utf8");
		const pact = JSON.parse(raw) as {
			consumer: { name: string };
			provider: { name: string };
			interactions: Array<{
				request: { body: { audience: string; role: string } };
				response: { body: { allowedActions: string[]; role: string } };
			}>;
		};

		expect(pact.consumer.name).toBe("@hobo/ci-guard");
		expect(pact.provider.name).toBe("hobo-oidc-token-broker");

		const interaction = pact.interactions[0];
		expect(interaction?.request.body.audience).toBe("hobo:sandbox-cloud");
		expect(interaction?.request.body.role).toBe("hobo-ci-hello-bindle-e2e");
		expect(interaction?.response.body.role).toBe("hobo-ci-hello-bindle-e2e");
		expect(interaction?.response.body.allowedActions).toEqual([
			"deployments:create",
			"deployments:read",
			"deployments:delete",
		]);
	});
});
