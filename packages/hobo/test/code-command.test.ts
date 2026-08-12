import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CODE_FEATURE_FLAGS, runHoboCodeCli } from "@hobo/code";
import { FeatureFlagStore } from "@hobo/identity";

import {
	featurePortFromStore,
	resolveCodeFeatures,
} from "../src/code-command.js";
import { describeCodeHarnessHealth } from "../src/code-health.js";

const temps: string[] = [];
afterEach(() => {
	for (const d of temps) rmSync(d, { recursive: true, force: true });
	temps.length = 0;
});

function temp(prefix: string): string {
	const d = mkdtempSync(join(tmpdir(), prefix));
	temps.push(d);
	return d;
}

describe("hobo-code composition bridge", () => {
	it("featurePortFromStore seeds all code.* flags ON including distributed", () => {
		const store = new FeatureFlagStore();
		const port = featurePortFromStore(store);
		expect(store.get(CODE_FEATURE_FLAGS.harnessEnabled)).toBeTruthy();
		expect(store.get(CODE_FEATURE_FLAGS.distributed)).toBeTruthy();
		expect(store.get(CODE_FEATURE_FLAGS.monetizationSurface)).toBeTruthy();
		expect(
			port.evaluateBoolean(CODE_FEATURE_FLAGS.distributed, {
				targetingKey: "t",
			}).value,
		).toBe(true);
	});

	it("runHoboCodeCli with identity features dispatches by default", async () => {
		const home = temp("hobo-hc-");
		const project = temp("hobo-hc-proj-");
		const features = resolveCodeFeatures({
			env: { HOBO_HOME: home, HOBO_TENANT: "local" },
		});
		const result = await runHoboCodeCli(["dispatch", "probe-identity"], {
			hoboHome: home,
			cwd: project,
			features,
		});
		expect(result.ok).toBe(true);
		expect(result.code).toBe("HOBO_CODE_DISPATCH");
	});

	it("describeCodeHarnessHealth points at hobo-code binary", () => {
		const home = temp("hobo-hc-doc-");
		const health = describeCodeHarnessHealth({
			hoboHome: home,
			env: { HOBO_HOME: home },
		});
		expect(health.binary).toBe("hobo-code");
		expect(health.defaultVerb).toBe("dispatch");
		expect(health.monetizationDefault).toBe("on");
		expect(health.distributedDefault).toBe("on");
	});
});
