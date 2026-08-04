import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	createDispatcherRegistry,
	decideDispatch,
} from "../../src/dispatcher.js";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const pact = JSON.parse(
	readFileSync(
		join(packageRoot, "../pacts/dispatch_decision.pact.json"),
		"utf8",
	),
);

const LEDGER_DIGEST =
	"sha256:1111111111111111111111111111111111111111111111111111111111111111";

describe("dispatch decision boundary consumer", () => {
	it("selects the cheapest in-budget traffic backend under budget pressure", () => {
		const decision = decideDispatch({
			registry: createDispatcherRegistry([
				{
					id: "vercel-primary",
					providerId: "vercel-primary",
					category: "traffic-backend",
					listUnitCost: 0.05,
				},
				{
					id: "lakebed-cheap",
					providerId: "lakebed-cheap",
					category: "traffic-backend",
					listUnitCost: 0.01,
				},
			]),
			category: "traffic-backend",
			objective: "maximize-credits",
			dispatchId: "route-swap-pact",
			units: 100,
			ledgerView: {
				view: "CreditLedgerView",
				seq: 7,
				digest: LEDGER_DIGEST,
				accounts: [],
			},
		});
		const interaction = pact.interactions[0];

		expect(decision.ok).toBe(interaction.response.body.ok);
		expect(decision.selectedProvider).toBe(
			interaction.response.body.selectedProvider,
		);
		expect(decision.dispatchEvent.type).toBe(
			interaction.response.body.dispatchEvent.type,
		);
	});

	it("fails closed with a reason when no candidates are registered", () => {
		const decision = decideDispatch({
			registry: createDispatcherRegistry([]),
			category: "runner",
			objective: "maximize-credits",
			dispatchId: "no-candidates-pact",
			ledgerView: {
				view: "CreditLedgerView",
				seq: 7,
				digest: LEDGER_DIGEST,
				accounts: [],
			},
		});
		const interaction = pact.interactions[1];

		expect(decision.ok).toBe(interaction.response.body.ok);
		expect(decision.reason).toBe(interaction.response.body.reason);
		expect(decision.dispatchEvent).toBeUndefined();
	});
});
