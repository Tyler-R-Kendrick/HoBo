import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	componentizeHelloBindle,
	runWasmtimeSmoke,
	validateWasmComponentArtifact,
} from "@hobo/componentize";

import { signComponentDigest, verifySignedArtifact } from "../../src/signing.js";

const packageRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const pactPath = join(packageRoot, "contracts/pacts/componentize-build-boundary.pact.json");

describe("hello-bindle componentize consumer pact", () => {
	it("satisfies componentize build boundary interactions", async () => {
		const pact = JSON.parse(await readFile(pactPath, "utf8"));
		const buildInteraction = pact.interactions[0];
		const signInteraction = pact.interactions[1];

		const result = await componentizeHelloBindle({
			sourceRoot: packageRoot,
			sourceDateEpoch: "2026-01-01T00:00:00.000Z",
		});
		const validation = validateWasmComponentArtifact(result.component);
		const smoke = await runWasmtimeSmoke(result.component, { exportName: "health" });
		const signed = signComponentDigest(result.component.digest);

		expect(buildInteraction.response.body.validation.passed).toBe(validation.passed);
		expect(buildInteraction.response.body.smoke.exitCode).toBe(smoke.exitCode);
		expect(buildInteraction.response.body.oci.mediaType).toBe(result.oci.manifest.mediaType);
		expect(signInteraction.response.body.signature.alg).toBe(signed.signature.alg);
		expect(signInteraction.response.body.provenanceTier).toBe(signed.provenanceTier);
		expect(verifySignedArtifact(signed)).toBe(true);
	});
});
