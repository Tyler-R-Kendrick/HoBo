import { readFile } from "node:fs/promises";

import {
	type BrokerCatalog,
	BrokerParseError,
	createBroker,
	REJECTION_MATRIX,
} from "@hobo/broker";
import type { CommandModule } from "@hobo/cli";

export interface BrokerCommandDeps {
	// The provider catalog resolutions run against. The composed Yard runtime's
	// PlannerRegistry satisfies this structurally; tests inject fixtures.
	readonly catalog: BrokerCatalog;
}

async function readJson(path: string, what: string): Promise<unknown> {
	const raw = await readFile(path, "utf8");
	try {
		return JSON.parse(raw);
	} catch {
		throw new BrokerParseError(
			"invalid-json",
			`invalid-json: ${what} at ${path} is not valid JSON`,
		);
	}
}

// `hobo broker` — the broker (the Conductor) surfaced on the CLI.
//   hobo broker resolve --policies <file> --request <file>
//     Run the real @hobo/broker pipeline (connectors -> gatekeeper -> billing
//     -> placement) and print the Resolution Receipt or the structured
//     Resolution Rejection. Exit ok=false on rejection so scripts can gate.
//   hobo broker matrix
//     Print the closed rejection-code catalog with per-plane remediations.
// Decision surface only: spin-up/down and rollout stay `hobo up`/`hobo down`
// territory (cli-spec.md lifecycle rule).
export function createBrokerCommand(deps: BrokerCommandDeps): CommandModule {
	return {
		run: async ({ args, flags, emitProgress }) => {
			const subcommand = args[0] ?? "resolve";

			if (subcommand === "matrix") {
				return {
					ok: true,
					status: "matrix",
					code: "HOBO_BROKER_MATRIX",
					message: `hobo broker matrix: ${REJECTION_MATRIX.length} cataloged rejection codes`,
					data: {
						command: "broker",
						matrix: REJECTION_MATRIX.map((row) => ({ ...row })),
					},
				};
			}

			if (subcommand !== "resolve") {
				return {
					ok: false,
					status: "unknown_subcommand",
					code: "HOBO_BROKER_USAGE",
					message: `hobo broker: unknown subcommand '${subcommand}'`,
					remediation: [
						"Use `hobo broker resolve --policies <file> --request <file>` or `hobo broker matrix`.",
					],
					data: { command: "broker" },
				};
			}

			const policiesPath = flags.policies;
			const requestPath = flags.request;
			if (typeof policiesPath !== "string" || typeof requestPath !== "string") {
				return {
					ok: false,
					status: "missing_inputs",
					code: "HOBO_BROKER_USAGE",
					message:
						"hobo broker resolve needs --policies <file> and --request <file> (JSON documents).",
					remediation: [
						"Pass the broker policy set with --policies and the brokering request with --request.",
					],
					data: { command: "broker" },
				};
			}

			try {
				const broker = createBroker({
					policies: await readJson(policiesPath, "broker policy set"),
					catalog: deps.catalog,
				});
				const resolution = await broker.resolve(
					await readJson(requestPath, "broker request"),
				);
				for (const event of resolution.events) {
					emitProgress(event.type);
				}
				if (resolution.outcome === "resolved") {
					return {
						ok: true,
						status: "resolved",
						code: "HOBO_BROKER_RESOLVED",
						message: `hobo broker: resolved ${resolution.receipt?.placements.length ?? 0} placement(s) under policy ${resolution.receipt?.placementPolicyId}`,
						data: {
							command: "broker",
							receipt: resolution.receipt,
							events: resolution.events,
						},
					};
				}
				return {
					ok: false,
					status: "rejected",
					code: "HOBO_BROKER_REJECTED",
					message: `hobo broker: rejected — ${resolution.rejection?.reasons
						.map((reason) => `${reason.plane}:${reason.code}`)
						.join(", ")}`,
					remediation: resolution.rejection?.reasons.map(
						(reason) =>
							REJECTION_MATRIX.find((row) => row.code === reason.code)
								?.remediation ?? reason.message,
					),
					data: {
						command: "broker",
						rejection: resolution.rejection,
						events: resolution.events,
					},
				};
			} catch (error) {
				if (error instanceof BrokerParseError) {
					return {
						ok: false,
						status: "invalid_input",
						code: "HOBO_BROKER_INVALID",
						message: `hobo broker: ${error.message}`,
						remediation: [
							"Fix the policy/request document to satisfy data-models/broker.cue and retry.",
						],
						data: { command: "broker", errorCode: error.code },
					};
				}
				throw error;
			}
		},
	};
}
