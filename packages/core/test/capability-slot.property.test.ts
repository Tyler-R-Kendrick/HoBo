// Property tests for the `slotBinding()` parse boundary (ADR-0157).
//
// The example-based suite in `capability-slot.test.ts` pins named refusals.
// These properties pin the claims that only hold over *all* inputs: the
// credential screen is total at every depth, the canonical form is a function
// of the configuration rather than of key insertion order, and the result is
// deep-frozen and key-sorted wherever a property bag appears.
//
// Determinism: every run is seeded so a failure reproduces exactly. Re-running
// with the same fast-check version and seed replays the same inputs.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	CAPABILITY_SLOTS,
	SLOT_BINDING_CONTRACT,
	type SlotBindingInput,
	slotBinding,
} from "../src/index.js";

/** Fixed seed: a counterexample found here is reproducible verbatim. */
const SEED = 20260817;
const RUNS = 300;

/** The screen the boundary claims to enforce, restated independently. */
const CREDENTIAL_KEY_PATTERN =
	/(secret|password|token|credential|private[_-]?key|api[_-]?key)/i;

const CREDENTIAL_BASES = [
	"secret",
	"password",
	"token",
	"credential",
	"private_key",
	"private-key",
	"privatekey",
	"api_key",
	"api-key",
	"apikey",
] as const;

const slotArb = fc.constantFrom(...CAPABILITY_SLOTS);

/** Keys that are not credential-shaped, so only the planted key can trip. */
const safeKeyArb = fc
	.stringMatching(/^[a-z][a-z0-9]{0,6}$/u)
	.filter((key) => key.length > 0 && !CREDENTIAL_KEY_PATTERN.test(key));

const jsonScalarArb = fc.oneof(
	fc.constant(null),
	fc.boolean(),
	fc.integer(),
	fc.double({ noNaN: true, noDefaultInfinity: true }),
	fc.string(),
);

const jsonValueArb: fc.Arbitrary<unknown> = fc.letrec<{ value: unknown }>(
	(tie) => ({
		value: fc.oneof(
			{ maxDepth: 3 },
			jsonScalarArb,
			fc.array(tie("value"), { maxLength: 3 }),
			fc.dictionary(safeKeyArb, tie("value"), { maxKeys: 4 }),
		),
	}),
).value;

const safePropertiesArb = fc.dictionary(safeKeyArb, jsonValueArb, {
	maxKeys: 5,
});

/** A credential-shaped key with adversarial casing and surrounding noise. */
const credentialKeyArb = fc
	.tuple(
		fc.constantFrom(...CREDENTIAL_BASES),
		fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }),
		fc.stringMatching(/^[a-z]{0,4}$/u),
		fc.stringMatching(/^[a-z]{0,4}$/u),
	)
	.map(([base, casing, prefix, suffix]) => {
		const cased = [...base]
			.map((char, index) =>
				casing[index % casing.length] === true ? char.toUpperCase() : char,
			)
			.join("");
		return `${prefix}${cased}${suffix}`;
	});

/**
 * A JSON-safe property bag that hides exactly one credential-shaped key, at an
 * arbitrary depth, behind plain objects and arrays. Everything else is benign,
 * so the only refusal the boundary can legitimately report is the credential.
 */
const hiddenCredentialArb = fc
	.tuple(
		credentialKeyArb,
		fc.array(fc.tuple(safeKeyArb, fc.boolean()), { maxLength: 4 }),
		jsonScalarArb,
		safePropertiesArb,
	)
	.map(([credentialKey, wrappers, payload, siblings]) => {
		let node: unknown = { ...siblings, [credentialKey]: payload };
		for (const [key, insideArray] of wrappers) {
			node = insideArray ? { [key]: [null, node] } : { [key]: node };
		}
		return node as Record<string, unknown>;
	});

const inputArb = fc
	.record({
		slot: slotArb,
		profile: fc.constantFrom(
			"data.postgres/v1",
			"web.static/v2",
			"kv.redis/v10",
		),
		productId: fc.constantFrom("aws.rds-postgres/v1", "gcp.cloud-sql/v1"),
		properties: safePropertiesArb,
	})
	.map((value): SlotBindingInput => value);

function byCodeUnit(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function assertKeysSortedDeep(value: unknown): void {
	if (Array.isArray(value)) {
		for (const entry of value) assertKeysSortedDeep(entry);
		return;
	}
	if (value === null || typeof value !== "object") return;
	const keys = Object.keys(value);
	expect(keys).toStrictEqual([...keys].sort(byCodeUnit));
	for (const key of keys) {
		assertKeysSortedDeep((value as Record<string, unknown>)[key]);
	}
}

function assertFrozenDeep(value: unknown): void {
	if (value === null || typeof value !== "object") return;
	expect(Object.isFrozen(value)).toBe(true);
	for (const entry of Object.values(value)) assertFrozenDeep(entry);
}

/** Rebuild with every object's keys reversed: same configuration, other order. */
function reverseKeyOrder(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(reverseKeyOrder);
	if (value === null || typeof value !== "object") return value;
	const out: Record<string, unknown> = {};
	for (const key of Object.keys(value).reverse()) {
		out[key] = reverseKeyOrder((value as Record<string, unknown>)[key]);
	}
	return out;
}

function codeOf(fn: () => unknown): string {
	try {
		fn();
		return "NO_THROW";
	} catch (error) {
		return (error as { code?: string }).code ?? "NO_CODE";
	}
}

describe("slotBinding is a total, canonical parse boundary", () => {
	it("freezes the record and sorts property keys at every depth", () => {
		fc.assert(
			fc.property(inputArb, (input) => {
				const binding = slotBinding(input);
				expect(binding.contract).toBe(SLOT_BINDING_CONTRACT);
				assertFrozenDeep(binding);
				assertKeysSortedDeep(binding.properties);
			}),
			{ seed: SEED, numRuns: RUNS },
		);
	});

	it("refuses a credential-shaped key at any depth", () => {
		fc.assert(
			fc.property(slotArb, hiddenCredentialArb, (slot, properties) => {
				expect(
					codeOf(() =>
						slotBinding({
							slot,
							profile: "data.postgres/v1",
							productId: "aws.rds-postgres/v1",
							properties,
						}),
					),
				).toBe("SLOT_BINDING_CREDENTIAL_PROPERTY");
			}),
			{ seed: SEED, numRuns: RUNS },
		);
	});

	it("is deterministic: the same input twice is deep-equal", () => {
		fc.assert(
			fc.property(inputArb, (input) => {
				expect(slotBinding(input)).toStrictEqual(slotBinding(input));
			}),
			{ seed: SEED, numRuns: RUNS },
		);
	});

	it("ignores key insertion order at every depth", () => {
		fc.assert(
			fc.property(inputArb, (input) => {
				const reordered = {
					...input,
					properties: reverseKeyOrder(input.properties) as Readonly<
						Record<string, unknown>
					>,
				};
				expect(slotBinding(reordered)).toStrictEqual(slotBinding(input));
			}),
			{ seed: SEED, numRuns: RUNS },
		);
	});
});
