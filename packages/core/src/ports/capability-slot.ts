/**
 * Capability slots and the typed slot-binding record (ADR-0157).
 *
 * Today an operator authors a Yard binding row by typing the planner's IR
 * directly — `{ profile: "data.postgres/v1", productId: "aws.rds-postgres/v1",
 * properties: { … } }`. That row shape is a *compile target*: magic strings,
 * no autocomplete, and no type checking on the property bag. This module is
 * the authoring surface that compiles into it. A provider package emits
 * `SlotBinding` records; `@hobo/yards` turns them into rows.
 *
 * It lives in `@hobo/core` because provider packages are layer-2 adapters that
 * may import core and nothing else — they cannot reach `@hobo/yards` (layer 3).
 * Putting the record here is what lets a provider declare "this product
 * satisfies the `data` slot" without the layering inversion.
 *
 * The parse boundary is `slotBinding()`. It fails closed on five things, each
 * with its own code so a refusal names the fix rather than a generic "invalid":
 * an unknown slot, a profile that does not match the ADR-0151 grammar, a row
 * that constrains nothing (no product and no connectivity — a binding that
 * cannot narrow selection is a portability lie, not a permissive default), a
 * credential-shaped property key, and a property value that is not JSON-safe.
 *
 * Credential screening is recursive here, unlike the top-level screen in
 * `@hobo/yards`: a secret nested one level down is exactly as leaked as one at
 * the root, and this record is the surface a provider author actually types.
 *
 * Determinism: the result is deep-frozen and its property keys are sorted by
 * code unit, so two authorings of the same configuration are deep-equal. No
 * clock, no randomness, no ambient environment reads.
 */

import { deepFreeze } from "../parse-utils.js";

// public-contract: the closed slot vocabulary provider packages bind against.
export const CAPABILITY_SLOTS = Object.freeze([
	"web",
	"api",
	"service",
	"data",
	"kv",
	"bucket",
	"queue",
	"topic",
	"secretRef",
	"webhook",
] as const);
export type CapabilitySlot = (typeof CAPABILITY_SLOTS)[number];

// public-contract: versioned identity stamped on every parsed slot binding.
export const SLOT_BINDING_CONTRACT = "hobo.slot-binding/v1";

/** ADR-0151 profile grammar: `<family>.<path>/v<major>`. */
const PROFILE_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*\/v[1-9][0-9]*$/u;

/** Property keys that read as a secret value rather than a locator. */
const CREDENTIAL_KEY_PATTERN =
	/(secret|password|token|credential|private[_-]?key|api[_-]?key)/i;

/** What a provider package authors: the slot plus how it is constrained. */
export interface SlotBindingInput {
	readonly slot: CapabilitySlot;
	/** ADR-0151 grammar: `<family>.<path>/v<major>`. */
	readonly profile: string;
	readonly productId?: string;
	readonly connectivityId?: string;
	readonly properties?: Readonly<Record<string, unknown>>;
}

/** The parsed, frozen, canonical record `@hobo/yards` compiles into a row. */
export interface SlotBinding {
	readonly contract: typeof SLOT_BINDING_CONTRACT;
	readonly slot: CapabilitySlot;
	readonly profile: string;
	readonly productId?: string;
	readonly connectivityId?: string;
	readonly properties: Readonly<Record<string, unknown>>;
}

export type SlotBindingErrorCode =
	| "SLOT_BINDING_SLOT_INVALID"
	| "SLOT_BINDING_PROFILE_INVALID"
	| "SLOT_BINDING_EMPTY_CONSTRAINT"
	| "SLOT_BINDING_CREDENTIAL_PROPERTY"
	| "SLOT_BINDING_PROPERTY_NOT_JSON";

/** Refusal from the `slotBinding()` parse boundary. Always carries a code. */
export class SlotBindingError extends Error {
	readonly code: SlotBindingErrorCode;
	readonly slot?: string;

	constructor(code: SlotBindingErrorCode, message: string, slot?: unknown) {
		super(message);
		this.name = "SlotBindingError";
		this.code = code;
		if (typeof slot === "string") {
			this.slot = slot;
		}
	}
}

/**
 * Parse boundary. Returns a deep-frozen `SlotBinding` whose property keys are
 * sorted, so two authorings of the same configuration are deep-equal.
 */
export function slotBinding(input: SlotBindingInput): SlotBinding {
	if (input === null || typeof input !== "object" || Array.isArray(input)) {
		throw new SlotBindingError(
			"SLOT_BINDING_SLOT_INVALID",
			`slot binding must be an object with a slot from ${CAPABILITY_SLOTS.join(" | ")}`,
		);
	}

	const slot = parseSlot(input.slot);
	const profile = parseProfile(input.profile, slot);
	const productId = parseConstraint(input.productId, "productId", slot);
	const connectivityId = parseConstraint(
		input.connectivityId,
		"connectivityId",
		slot,
	);
	if (productId === undefined && connectivityId === undefined) {
		throw new SlotBindingError(
			"SLOT_BINDING_EMPTY_CONSTRAINT",
			`slot "${slot}" binds profile "${profile}" without a productId or a connectivityId: a binding that narrows nothing cannot be satisfied by a provider, so it is refused rather than silently matching everything`,
			slot,
		);
	}

	const properties = canonicalizeProperties(input.properties, slot);

	return deepFreeze({
		contract: SLOT_BINDING_CONTRACT,
		slot,
		profile,
		...(productId !== undefined ? { productId } : {}),
		...(connectivityId !== undefined ? { connectivityId } : {}),
		properties,
	});
}

function parseSlot(value: unknown): CapabilitySlot {
	if (
		typeof value !== "string" ||
		!(CAPABILITY_SLOTS as readonly string[]).includes(value)
	) {
		throw new SlotBindingError(
			"SLOT_BINDING_SLOT_INVALID",
			`slot: expected ${CAPABILITY_SLOTS.join(" | ")}; a slot is never inferred because the wrong slot binds a capability the app never asked for`,
			value,
		);
	}
	return value as CapabilitySlot;
}

function parseProfile(value: unknown, slot: CapabilitySlot): string {
	if (typeof value !== "string" || !PROFILE_PATTERN.test(value)) {
		throw new SlotBindingError(
			"SLOT_BINDING_PROFILE_INVALID",
			`profile: expected the ADR-0151 grammar <family>.<path>/v<major> (lowercase, dot-separated, "/v" plus a major starting at 1), received ${JSON.stringify(value)}`,
			slot,
		);
	}
	return value;
}

/**
 * A constraint is present only when it is a non-blank string. A blank or
 * non-string value reads as absent so it collapses into the single
 * `SLOT_BINDING_EMPTY_CONSTRAINT` refusal instead of quietly binding `""`.
 */
function parseConstraint(
	value: unknown,
	field: string,
	slot: CapabilitySlot,
): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string") {
		throw new SlotBindingError(
			"SLOT_BINDING_EMPTY_CONSTRAINT",
			`${field}: expected a non-empty string, received ${JSON.stringify(value)}`,
			slot,
		);
	}
	if (value.trim().length === 0) return undefined;
	return value;
}

function canonicalizeProperties(
	value: unknown,
	slot: CapabilitySlot,
): Readonly<Record<string, unknown>> {
	if (value === undefined) return {};
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new SlotBindingError(
			"SLOT_BINDING_PROPERTY_NOT_JSON",
			`properties: expected a JSON object, received ${describe(value)}`,
			slot,
		);
	}
	return canonicalizeRecord(
		value as Record<string, unknown>,
		"properties",
		slot,
		new Set<object>(),
	);
}

function canonicalizeRecord(
	record: Readonly<Record<string, unknown>>,
	path: string,
	slot: CapabilitySlot,
	seen: Set<object>,
): Readonly<Record<string, unknown>> {
	enterCycleGuard(record, path, slot, seen);
	const out: Record<string, unknown> = {};
	// Code-unit sort: locale-independent so two authorings agree byte for byte.
	for (const key of Object.keys(record).sort(compare)) {
		if (CREDENTIAL_KEY_PATTERN.test(key)) {
			throw new SlotBindingError(
				"SLOT_BINDING_CREDENTIAL_PROPERTY",
				`${path}.${key}: slot binding properties must not carry credentials — bind a secretRef slot and let the provider resolve it at deploy time`,
				slot,
			);
		}
		out[key] = canonicalizeValue(record[key], `${path}.${key}`, slot, seen);
	}
	seen.delete(record);
	return out;
}

function canonicalizeValue(
	value: unknown,
	path: string,
	slot: CapabilitySlot,
	seen: Set<object>,
): unknown {
	if (
		value === null ||
		typeof value === "boolean" ||
		typeof value === "string"
	) {
		return value;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new SlotBindingError(
				"SLOT_BINDING_PROPERTY_NOT_JSON",
				`${path}: ${String(value)} has no JSON representation`,
				slot,
			);
		}
		return value;
	}
	if (Array.isArray(value)) {
		enterCycleGuard(value, path, slot, seen);
		const out = value.map((entry, index) =>
			canonicalizeValue(entry, `${path}[${index}]`, slot, seen),
		);
		seen.delete(value);
		return out;
	}
	if (isPlainObject(value)) {
		return canonicalizeRecord(value, path, slot, seen);
	}
	throw new SlotBindingError(
		"SLOT_BINDING_PROPERTY_NOT_JSON",
		`${path}: expected a JSON-safe value (null, boolean, finite number, string, array, plain object), received ${describe(value)}`,
		slot,
	);
}

function enterCycleGuard(
	value: object,
	path: string,
	slot: CapabilitySlot,
	seen: Set<object>,
): void {
	if (seen.has(value)) {
		throw new SlotBindingError(
			"SLOT_BINDING_PROPERTY_NOT_JSON",
			`${path}: properties contain a cycle, which has no JSON representation`,
			slot,
		);
	}
	seen.add(value);
}

/** Plain data only: a class instance carries behavior a row cannot serialize. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object") return false;
	const prototype: unknown = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function describe(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "an array";
	if (typeof value === "object") {
		const name: unknown = value.constructor?.name;
		return typeof name === "string"
			? `a ${name} instance`
			: "a non-plain object";
	}
	return `a ${typeof value}`;
}

/** Code-unit comparison: locale-independent so ordering is reproducible. */
function compare(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}
