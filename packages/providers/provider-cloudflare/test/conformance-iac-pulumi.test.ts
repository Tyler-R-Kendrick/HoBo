import assert from "node:assert/strict";
import { describe, it } from "vitest";

// TEST-ONLY composition proof. The package boundary guard forbids adapter ->
// adapter runtime imports, so @hobo/iac-pulumi is NOT a src or package.json
// dependency; it is resolved here purely at test time (via node_modules symlink)
// to prove realize() output is accepted by the real IaC backend.
import {
	createPulumiAutomationAdapter,
	runIacBackendConformance,
	validateIacProgram,
} from "@hobo/iac-pulumi";

import {
	createCloudflareProvider,
	realizeHelloBindle,
	createHelloBindlePlan,
	type ResourcePlan,
} from "../src/index.js";

const PORTS: Array<{ port: string; name: string }> = [
	{ port: "compute", name: "web" },
	{ port: "kv", name: "sessions" },
	{ port: "objectStore", name: "assets" },
];

describe("realize() output composes with @hobo/iac-pulumi.validateIacProgram", () => {
	for (const { port, name } of PORTS) {
		it(`iac-pulumi accepts the realized ${port} program`, () => {
			const provider = createCloudflareProvider();
			const plan: ResourcePlan = { name, port, provider: "cloudflare" };
			const { iac } = provider.realize(plan);
			assert.doesNotThrow(() => validateIacProgram(iac));
		});
	}

	it("iac-pulumi accepts the whole hello-bindle program", () => {
		const { iac } = realizeHelloBindle(createHelloBindlePlan());
		assert.doesNotThrow(() => validateIacProgram(iac));
	});
});

describe("realized programs are previewable / applyable end-to-end", () => {
	it("passes the iac-pulumi backend conformance suite for a single-port program", async () => {
		const provider = createCloudflareProvider();
		const { iac } = provider.realize({
			name: "assets",
			port: "objectStore",
			provider: "cloudflare",
		});
		const adapter = createPulumiAutomationAdapter();
		const report = await runIacBackendConformance({ adapter, program: iac });
		assert.equal(report.passed, true);
	});

	it("previews the hello-bindle program to a dirty diff", async () => {
		const { iac } = realizeHelloBindle(createHelloBindlePlan());
		const adapter = createPulumiAutomationAdapter();
		const preview = await adapter.preview(iac);
		assert.equal(preview.kind, "diff");
		assert.equal(preview.dirty, true);
		assert.equal(preview.changes.length, 3);
	});
});
