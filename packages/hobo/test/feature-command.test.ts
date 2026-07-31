import { describe, expect, it } from "vitest";

import { features, featureSpecsToStoreInputs } from "@hobo/bindles";
import {
	FeatureFlagStore,
	createHarness,
	createLocalFeatureClient,
} from "@hobo/identity";

import { createFeatureCommand } from "../src/feature-command.js";

function runInput(args: string[], flags: Record<string, unknown> = {}) {
	return {
		args,
		flags,
		context: { cwd: "/tmp", projectDir: "/tmp" },
		emitProgress: () => {},
	};
}

describe("hobo feature (OpenFeature observe)", () => {
	it("list / set / eval / kill against an injected store", async () => {
		const store = new FeatureFlagStore();
		const cmd = createFeatureCommand({ store, env: {} });

		const set = await cmd.run(
			runInput(["set", "checkout"], { percent: 40 }) as never,
		);
		expect(set.ok).toBe(true);
		expect(store.get("checkout")?.percentage).toBe(40);

		const list = await cmd.run(runInput(["list"]) as never);
		expect(list.ok).toBe(true);
		expect(list.data?.openFeatureOnly).toBe(true);
		expect(
			(list.data?.flags as { key: string }[]).some((f) => f.key === "checkout"),
		).toBe(true);

		const evald = await cmd.run(
			runInput(["eval", "checkout"], {
				tenant: "acme",
				subject: "user:alice",
			}) as never,
		);
		expect(evald.ok).toBe(true);
		expect(evald.data?.provider).toBe("hobo-feature-flag");
		expect(typeof evald.data?.value).toBe("boolean");

		const kill = await cmd.run(runInput(["kill", "checkout"]) as never);
		expect(kill.ok).toBe(true);
		expect(store.get("checkout")?.killSwitch).toBe(true);
	});

	it("canary and experiment status are native subcommands", async () => {
		const store = new FeatureFlagStore();
		const cmd = createFeatureCommand({ store, env: {} });
		const canary = await cmd.run(runInput(["canary"]) as never);
		expect(canary.ok).toBe(true);
		expect(canary.code).toBe("HOBO_CANARY_STATUS");
		const exp = await cmd.run(runInput(["experiment"]) as never);
		expect(exp.ok).toBe(true);
		expect(exp.code).toBe("HOBO_EXPERIMENT_STATUS");
	});

	it("Bindle features → FeatureFlagStore → OpenFeature → progressive end-to-end", () => {
		const decl = features({
			checkout: {
				state: "ENABLED",
				percentage: 0,
				variants: { control: false, treatment: true },
				defaultVariant: "control",
			},
		});
		const store = new FeatureFlagStore({ sampleRate: 1 });
		store.loadDefinitions(featureSpecsToStoreInputs(decl));
		const client = createLocalFeatureClient(store, {
			userId: "user:e2e",
			tenant: "acme",
		});
		expect(client.getBooleanValue("checkout", false)).toBe(false);

		const harness = createHarness({ store });
		const run = harness.startProgressive({
			rollout: {
				name: "checkout-canary",
				flag: "checkout",
				stages: [{ percent: 100 }],
				traffic: "gateway-weighted",
				autoRollback: true,
			},
			experiment: {
				name: "checkout-exp",
				flag: "checkout",
				variants: ["control", "treatment"],
			},
		});
		expect(run.percent).toBe(100);
		expect(run.gatewayWeightPercent).toBe(100);
		expect(run.trafficSplit?.canary).toBe(100);
		const promoted = harness.advance(run.rolloutId);
		expect(promoted.status).toBe("promoted");
		expect(client.getBooleanValue("checkout", false)).toBe(true);
	});
});
