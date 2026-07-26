import { createHash } from "node:crypto";

// Parse, don't validate: the exported interfaces below are the parsed, derived
// domain types the contract engine works with. Their protobuf wire forms live in
// data-models/contracts.proto with a CUE constraint per message in
// data-models/contracts.cue; the constructors here (parseBoundaryContract) are
// the only supported way to build a contract value, so downstream code — the
// can-deploy engine, the Gatekeeper — never re-validates a raw record.

export const CONTRACT_IR_SCHEMA_VERSION = "hobo.contract-ir/v1";

export const CONTRACT_MODES = Object.freeze([
	"declared",
	"inferred",
	"observed",
	"promoted",
] as const);

export const CONTRACT_EDGE_KINDS = Object.freeze([
	"http",
	"event",
	"message",
	"topic",
	"resource-binding",
	"capability-scope",
	"runtime-slo",
	"semantic-function",
	"agent-tool",
	"provider-interface",
	"service",
	"actor",
	"workflow",
] as const);

export type ContractMode = (typeof CONTRACT_MODES)[number];
export type ContractEdgeKind = (typeof CONTRACT_EDGE_KINDS)[number];

const MODE_SET = new Set<string>(CONTRACT_MODES);
const EDGE_KIND_SET = new Set<string>(CONTRACT_EDGE_KINDS);
const SEMVER_RE =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-.]+)?$/;

export class ContractIrValidationError extends Error {
	code: string;
	path: string;

	constructor(code: string, message: string, path = "$") {
		super(`${code} at ${path}: ${message}`);
		this.name = "ContractIrValidationError";
		this.code = code;
		this.path = path;
	}
}

// domain-view: parsed producer/consumer edge; wire form is ContractEdge in data-models/contracts.proto.
export interface ContractEdge {
	kind: ContractEdgeKind;
	producer: string;
	consumer: string;
	channel: string;
	operation: string;
}

// domain-view: parsed boundary shape; wire form is RequiredShape in data-models/contracts.proto.
export interface RequiredShape {
	format: string;
	requiredFields: string[];
	providedFields: string[];
}

// domain-view: parse-don't-validate boundary contract; wire form is BoundaryContract in data-models/contracts.proto.
export interface BoundaryContract {
	schemaVersion: typeof CONTRACT_IR_SCHEMA_VERSION;
	id: string;
	version: string;
	mode: ContractMode;
	edge: ContractEdge;
	requiredShape: RequiredShape;
	contractHash: `sha256:${string}`;
}

// domain-view: single breaking-change fact; wire form is CompatibilityReason in data-models/contracts.proto.
export interface CompatibilityReason {
	code: string;
	message: string;
	contractId: string;
	channel: string;
	prevVersion: string;
	nextVersion: string;
	fields: string[];
}

export type CompatibilityResult =
	| { kind: "compatible"; contractId: string; channel: string }
	| { kind: "breaking"; reasons: CompatibilityReason[] };

export interface BoundaryContractInput {
	id: unknown;
	version: unknown;
	mode?: unknown;
	edge: unknown;
	requiredShape: unknown;
}

export function parseBoundaryContract(input: unknown): BoundaryContract {
	const source = expectObject(input, "$");
	const id = nonEmptyString(source.id, "$.id");
	const version = semver(source.version, "$.version");
	const mode = enumValue(source.mode ?? "declared", MODE_SET, "$.mode");
	const edge = parseEdge(source.edge, "$.edge");
	const requiredShape = parseRequiredShape(
		source.requiredShape,
		"$.requiredShape",
	);

	const core = {
		schemaVersion:
			CONTRACT_IR_SCHEMA_VERSION as typeof CONTRACT_IR_SCHEMA_VERSION,
		id,
		version,
		mode: mode as ContractMode,
		edge,
		requiredShape,
	};
	const contractHash = hashContract(core);
	return Object.freeze({ ...core, contractHash });
}

export function createBoundaryContract(
	input: Partial<BoundaryContractInput> = {},
): BoundaryContract {
	return parseBoundaryContract({
		id: input.id ?? "contract-orders-http",
		version: input.version ?? "1.0.0",
		mode: input.mode ?? "declared",
		edge:
			input.edge ??
			({
				kind: "event",
				producer: "orders-api@1.0.0",
				consumer: "worker@1.0.0",
				channel: "orders.http",
				operation: "order.created",
			} as unknown),
		requiredShape:
			input.requiredShape ??
			({
				format: "json-schema",
				requiredFields: ["id", "tenantId"],
				providedFields: ["id", "tenantId"],
			} as unknown),
	});
}

// checkCompatibility(prev, next) is the version-skew answer the design calls for
// (contracts-policy-flags.md §can-deploy): does the `next` revision of a boundary
// contract still satisfy every consumer the `prev` revision served? A removed
// field a consumer depended on is a breaking change; adding fields is safe.
export function checkCompatibility(
	prev: BoundaryContract,
	next: BoundaryContract,
): CompatibilityResult {
	const reasons: CompatibilityReason[] = [];

	if (prev.edge.channel !== next.edge.channel) {
		reasons.push(
			reason(
				"channel-changed",
				`contract ${prev.id} moved channel ${prev.edge.channel} -> ${next.edge.channel}`,
				prev,
				next,
				[],
			),
		);
	}

	// A field the prior revision guaranteed (provided or required) that the next
	// revision no longer provides breaks any consumer that reads it.
	const guaranteed = new Set([
		...prev.requiredShape.providedFields,
		...prev.requiredShape.requiredFields,
	]);
	const nextProvides = new Set(next.requiredShape.providedFields);
	const removed = [...guaranteed]
		.filter((field) => !nextProvides.has(field))
		.sort();
	if (removed.length > 0) {
		reasons.push(
			reason(
				"required-field-removed",
				`contract ${prev.id} v${next.version} removed field(s) ${removed.join(", ")} that consumers on ${prev.edge.channel} require`,
				prev,
				next,
				removed,
			),
		);
	}

	if (semverMajor(next.version) < semverMajor(prev.version)) {
		reasons.push(
			reason(
				"version-regressed",
				`contract ${prev.id} version regressed ${prev.version} -> ${next.version}`,
				prev,
				next,
				[],
			),
		);
	}

	if (reasons.length > 0) {
		return { kind: "breaking", reasons };
	}
	return {
		kind: "compatible",
		contractId: next.id,
		channel: next.edge.channel,
	};
}

export function isCompatible(result: CompatibilityResult): boolean {
	return result.kind === "compatible";
}

export function serializeBoundaryContract(contract: BoundaryContract): string {
	return canonicalJson(parseBoundaryContract(contract));
}

function reason(
	code: string,
	message: string,
	prev: BoundaryContract,
	next: BoundaryContract,
	fields: string[],
): CompatibilityReason {
	return {
		code,
		message,
		contractId: prev.id,
		channel: prev.edge.channel,
		prevVersion: prev.version,
		nextVersion: next.version,
		fields,
	};
}

function parseEdge(input: unknown, path: string): ContractEdge {
	const edge = expectObject(input, path);
	return {
		kind: enumValue(
			edge.kind,
			EDGE_KIND_SET,
			`${path}.kind`,
		) as ContractEdgeKind,
		producer: nonEmptyString(edge.producer, `${path}.producer`),
		consumer: nonEmptyString(edge.consumer, `${path}.consumer`),
		channel: nonEmptyString(edge.channel, `${path}.channel`),
		operation: nonEmptyString(edge.operation, `${path}.operation`),
	};
}

function parseRequiredShape(input: unknown, path: string): RequiredShape {
	const shape = expectObject(input, path);
	return {
		format: nonEmptyString(shape.format, `${path}.format`),
		requiredFields: stringArray(shape.requiredFields, `${path}.requiredFields`),
		providedFields: stringArray(
			shape.providedFields ?? shape.requiredFields,
			`${path}.providedFields`,
		),
	};
}

function hashContract(
	core: Omit<BoundaryContract, "contractHash">,
): `sha256:${string}` {
	const digest = createHash("sha256").update(canonicalJson(core)).digest("hex");
	return `sha256:${digest}`;
}

export function canonicalJson(value: unknown): string {
	return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.keys(value as Record<string, unknown>)
				.sort()
				.map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
		);
	}
	return value;
}

function semverMajor(version: string): number {
	return Number(version.split(".")[0]);
}

function expectObject(input: unknown, path: string): Record<string, any> {
	if (input === null || typeof input !== "object" || Array.isArray(input)) {
		throw new ContractIrValidationError(
			"expected-object",
			"expected a JSON object",
			path,
		);
	}
	return input as Record<string, any>;
}

function nonEmptyString(input: unknown, path: string): string {
	if (typeof input !== "string" || input.trim() === "") {
		throw new ContractIrValidationError(
			"expected-string",
			"expected a non-empty string",
			path,
		);
	}
	return input;
}

function semver(input: unknown, path: string): string {
	const value = nonEmptyString(input, path);
	if (!SEMVER_RE.test(value)) {
		throw new ContractIrValidationError("invalid-semver", value, path);
	}
	return value;
}

function enumValue(input: unknown, allowed: Set<string>, path: string): string {
	const value = nonEmptyString(input, path);
	if (!allowed.has(value)) {
		throw new ContractIrValidationError("unknown-value", value, path);
	}
	return value;
}

function stringArray(input: unknown, path: string): string[] {
	if (!Array.isArray(input)) {
		throw new ContractIrValidationError(
			"expected-array",
			"expected an array",
			path,
		);
	}
	const values = input.map((item, index) =>
		nonEmptyString(item, `${path}[${index}]`),
	);
	return [...new Set(values)].sort();
}
