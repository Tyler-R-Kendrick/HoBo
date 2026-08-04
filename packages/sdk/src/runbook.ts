import {
	deepFreeze,
	requireNonEmptyString,
	requireRecord,
	SdkDeclarationError,
} from "./errors.js";
import { RUNBOOK_SCHEMA } from "./schema.js";

// Greenfield declaration factory (walkthrough §6.2): a runbook is a trigger →
// read-only diagnosis → gated, blast-radius-bounded fixes, versioned and
// signed like a Resource Pack. Honest scope: the declaration contract only;
// the incident-response engine that executes it is a separate initiative.

// domain-view: authored runbook trigger; wire form is RunbookTrigger in data-models/sdk.proto.
export interface RunbookTrigger {
	readonly alert: string;
	/** Optional severity floor, e.g. ">=SEV2". */
	readonly severity?: string;
}

// domain-view: authored gated fix step; wire form is RunbookFixStep in data-models/sdk.proto.
export interface RunbookFixStep {
	/** Classified condition, e.g. "provider-degraded". */
	readonly when: string;
	/** Fix verb, e.g. "failover" | "scale" | "escalate". */
	readonly do: string;
	/** Gate for the write — fail-closed default is "require-approval". */
	readonly gate: "auto" | "require-approval";
	/** Verb arguments (camp, to, …) carried verbatim, frozen. */
	readonly args: Readonly<Record<string, unknown>>;
}

// domain-view: authored runbook; wire form is RunbookDeclaration in data-models/sdk.proto.
export interface RunbookDeclaration {
	readonly schema: string;
	readonly name: string;
	readonly on: RunbookTrigger;
	/** Read-only diagnosis queries (MCP), e.g. "logs api". */
	readonly diagnose: readonly string[];
	readonly fix: readonly RunbookFixStep[];
}

export interface RunbookFixSpec {
	when: string;
	do: string;
	gate?: "auto" | "require-approval";
	[argument: string]: unknown;
}

export interface RunbookSpec {
	on: { alert: string; severity?: string };
	diagnose: string[];
	fix: RunbookFixSpec[];
}

function parseFixStep(step: unknown, index: number): RunbookFixStep {
	const record = requireRecord("runbook", `fix[${index}]`, step);
	const when = requireNonEmptyString(
		"runbook",
		`fix[${index}].when`,
		record.when,
	);
	const verb = requireNonEmptyString("runbook", `fix[${index}].do`, record.do);
	const gate = record.gate ?? "require-approval";
	if (gate !== "auto" && gate !== "require-approval") {
		throw new SdkDeclarationError(
			"runbook",
			`fix[${index}].gate`,
			'must be "auto" or "require-approval"',
		);
	}
	const args: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(record)) {
		if (key === "when" || key === "do" || key === "gate") continue;
		args[key] = value;
	}
	return { when, do: verb, gate, args };
}

export function runbook(name: string, spec: RunbookSpec): RunbookDeclaration {
	requireNonEmptyString("runbook", "name", name);
	const record = requireRecord("runbook", "spec", spec);
	const trigger = requireRecord("runbook", "on", record.on);
	const alert = requireNonEmptyString("runbook", "on.alert", trigger.alert);
	const severity =
		trigger.severity === undefined
			? undefined
			: requireNonEmptyString("runbook", "on.severity", trigger.severity);
	if (!Array.isArray(record.diagnose) || record.diagnose.length === 0) {
		throw new SdkDeclarationError(
			"runbook",
			"diagnose",
			"must be a non-empty array of read-only diagnosis queries",
		);
	}
	const diagnose = record.diagnose.map((query, index) =>
		requireNonEmptyString("runbook", `diagnose[${index}]`, query),
	);
	if (!Array.isArray(record.fix) || record.fix.length === 0) {
		throw new SdkDeclarationError(
			"runbook",
			"fix",
			"must be a non-empty array of gated fix steps",
		);
	}
	const fix = record.fix.map((step, index) => parseFixStep(step, index));

	return deepFreeze({
		schema: RUNBOOK_SCHEMA,
		name,
		on: { alert, ...(severity !== undefined ? { severity } : {}) },
		diagnose,
		fix,
	});
}
