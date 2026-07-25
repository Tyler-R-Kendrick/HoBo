import assert from "node:assert/strict";
import { describe, it } from "vitest";

// Cross-adapter composition proof. Adapters may not import each other
// (package boundary guard), so proving that provider-cloudflare's realize()
// output is accepted by the real @hobo/iac-pulumi backend lives here in the
// composition root, which legitimately depends on both adapters.
import {
	createPulumiAutomationAdapter,
	runIacBackendConformance,
	validateIacProgram,
} from "@hobo/iac-pulumi";
import {
	createCloudflareProvider,
	createHelloBindlePlan,
	realizeHelloBindle,
	type ResourcePlan,
} from "@hobo/provider-cloudflare";

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
