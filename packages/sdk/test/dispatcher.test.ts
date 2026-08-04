import { decideDispatch } from "@hobo/dispatcher";
import { describe, expect, it } from "vitest";

import {
	DISPATCHER_DECLARATION_SCHEMA,
	dispatcher,
	RUNNER_SCHEMA,
	runner,
	SdkDeclarationError,
} from "../src/index.js";

// The walkthrough §5.2 call shape: cost-routed CI runners.
const fleet = dispatcher({ objective: "min-cost" }, [
	runner.selfHosted({ behind: "relay" }),
	runner.github({ listUnitCost: 2 }),
	runner.depot({ listUnitCost: 3 }),
	runner.blacksmith({ listUnitCost: 4 }),
]);

describe("runner", () => {
	it("produces frozen, schema-versioned runner declarations", () => {
		const github = runner.github();
		expect(Object.isFrozen(github)).toBe(true);
		expect(github.schema).toBe(RUNNER_SCHEMA);
		expect(github.kind).toBe("github");
		expect(github.providerId).toBe("runner.github");
		expect(github.category).toBe("runner");
	});

	it("pins self-hosted runners behind the outbound relay", () => {
		const selfHosted = runner.selfHosted({ behind: "relay" });
		expect(selfHosted.behind).toBe("relay");
		expect(() => runner.selfHosted({ behind: "vpn" as never })).toThrow(
			SdkDeclarationError,
		);
	});

	it("rejects negative costs", () => {
		expect(() => runner.github({ listUnitCost: -1 })).toThrow(
			SdkDeclarationError,
		);
	});
});

describe("dispatcher", () => {
	it("produces a frozen declaration wrapping the engine registry", () => {
		expect(Object.isFrozen(fleet)).toBe(true);
		expect(Object.isFrozen(fleet.runners)).toBe(true);
		expect(fleet.schema).toBe(DISPATCHER_DECLARATION_SCHEMA);
		expect(fleet.objective).toBe("min-cost");
		expect(fleet.engineObjective).toBe("maximize-credits");
		expect(fleet.registry.records).toHaveLength(4);
		expect(fleet.registry.byCategory.get("runner")).toHaveLength(4);
	});

	it("rejects unknown objectives", () => {
		expect(() =>
			dispatcher({ objective: "max-speed" as never }, [runner.github()]),
		).toThrow(SdkDeclarationError);
	});

	it("rejects an empty fleet", () => {
		expect(() => dispatcher({ objective: "min-cost" }, [])).toThrow(
			SdkDeclarationError,
		);
	});

	it("rejects candidates not authored with runner.*", () => {
		expect(() =>
			dispatcher({ objective: "min-cost" }, [{ providerId: "rogue" } as never]),
		).toThrow(SdkDeclarationError);
	});

	it("feeds @hobo/dispatcher's decideDispatch and records dispatch.Decided", () => {
		const decision = decideDispatch({
			category: "runner",
			objective: fleet.engineObjective,
			dispatchId: "ci-job-1",
			registry: fleet.registry,
			ledgerView: { view: "CreditLedgerView", seq: 0, accounts: [] },
		});
		expect(decision.ok).toBe(true);
		expect(decision.selectedProvider).toBe("runner.self-hosted");
		expect(decision.dispatchEvent.type).toBe("dispatch.Decided");
		expect(
			decision.dispatchEvent.data.candidates.map(
				(candidate: { provider: string }) => candidate.provider,
			),
		).toContain("runner.github");
	});
});
