/**
 * Pact v3 provider states: each interaction names the state the provider must
 * be in before it is replayed ("Allow multiple provider states with
 * parameters", https://github.com/pact-foundation/pact-specification/tree/version-3):
 *
 *   "providerStates": [{ "name": "no project hobo-pact-site exists" },
 *                      { "name": "the user is logged in", "params": { "username": "Fred" } }]
 *
 * `parseProviderStates` reads them from a raw pact, in its interaction order,
 * and `verifyPact(pact, provider, { providerStates, stateHandlers })` calls the
 * handler for each state, with its params, before that interaction, so the
 * interactions verify in any order rather than only the order they were
 * written in. A state a provider verification has no handler for fails that
 * interaction; it is never skipped.
 *
 * Parse, don't validate: a state is a non-empty name and params that are a
 * JSON object, nothing else. Records: `data-models/contract-harness.proto`
 * `PactProviderState`, constrained by `contract-harness.cue`.
 */
import type { PactJsonValue } from "./matching.js";
import type { PactRequest } from "./pact.js";

type JsonRecord = { readonly [key: string]: PactJsonValue };

// domain-view: one parsed provider state; data-models/contract-harness.proto PactProviderState is its wire form.
export interface PactProviderState {
	readonly name: string;
	readonly params: JsonRecord;
}

// domain-view: the provider states of one interaction, in the pact's order.
export interface InteractionProviderStates {
	readonly request: Pick<PactRequest, "method" | "path">;
	readonly states: readonly PactProviderState[];
}

/** Puts the provider in one named state; `params` are the state's own. */
export type ProviderStateHandler = (params: JsonRecord) => void | Promise<void>;

export class ProviderStateError extends Error {
	readonly code = "PROVIDER_STATE_INVALID";

	constructor(message: string) {
		super(`PROVIDER_STATE_INVALID: ${message}`);
		this.name = "ProviderStateError";
	}
}

const tagOf = Object.prototype.toString;

function isRecord(value: PactJsonValue | undefined): value is JsonRecord {
	return tagOf.call(value) === "[object Object]";
}

function isText(value: PactJsonValue | undefined): value is string {
	return tagOf.call(value) === "[object String]";
}

const STATE_KEYS: ReadonlySet<string> = new Set(["name", "params"]);
const METHODS: ReadonlySet<string> = new Set([
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
]);

function isMethod(value: string): value is PactRequest["method"] {
	return METHODS.has(value);
}

function parseState(value: PactJsonValue, where: string): PactProviderState {
	if (!isRecord(value) || !isText(value.name) || value.name === "") {
		throw new ProviderStateError(`${where} needs a non-empty name`);
	}
	for (const key of Object.keys(value)) {
		if (!STATE_KEYS.has(key)) {
			throw new ProviderStateError(
				`${where} has key ${JSON.stringify(key)}; a provider state has only name and params`,
			);
		}
	}
	const params = value.params ?? {};
	if (!isRecord(params)) {
		throw new ProviderStateError(`${where}.params must be an object`);
	}
	return Object.freeze({ name: value.name, params: Object.freeze(params) });
}

/**
 * One interaction's `providerStates` (`where` names the interaction), none
 * when it has none; a malformed one, or a Pact v2 `providerState` beside them
 * (`v2State`), is `ProviderStateError`. `parsePactDocument` reads them with
 * this too.
 */
export function readProviderStates(
	declared: PactJsonValue | undefined,
	where: string,
	v2State: PactJsonValue | undefined = undefined,
): readonly PactProviderState[] {
	if (v2State !== undefined) {
		// A v2 state is one free-text string; read as "no v3 states" it would let
		// the interaction run in whatever state it finds.
		throw new ProviderStateError(
			`${where} names a Pact v2 providerState; this harness sets up Pact v3 providerStates ([{ "name": ... }]) only`,
		);
	}
	if (declared === undefined) return Object.freeze([]);
	if (!Array.isArray(declared)) {
		throw new ProviderStateError(`${where}.providerStates must be a list`);
	}
	return Object.freeze(
		declared.map((state: PactJsonValue, at) =>
			parseState(state, `${where}.providerStates[${at}]`),
		),
	);
}

/** The provider states of every interaction in a raw pact document, in its order. */
export function parseProviderStates(
	document: PactJsonValue,
): readonly InteractionProviderStates[] {
	if (!isRecord(document) || !Array.isArray(document.interactions)) {
		throw new ProviderStateError("document must be a pact with interactions");
	}
	return Object.freeze(
		document.interactions.map((interaction: PactJsonValue, index) => {
			const where = `interactions[${index}]`;
			if (!isRecord(interaction) || !isRecord(interaction.request)) {
				throw new ProviderStateError(`${where} must carry a request`);
			}
			const { method, path } = interaction.request;
			if (!isText(method) || !isMethod(method) || !isText(path)) {
				throw new ProviderStateError(
					`${where}.request needs a method and a path`,
				);
			}
			return Object.freeze({
				request: Object.freeze({ method, path }),
				states: readProviderStates(
					interaction.providerStates,
					where,
					interaction.providerState,
				),
			});
		}),
	);
}
