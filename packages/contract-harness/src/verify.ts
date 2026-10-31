import {
	type InteractionMatchingRules,
	matchResponseBody,
	type PactJsonValue,
} from "./matching.js";
import type { PactDocument, PactRequest, PactResponse } from "./pact.js";
import type {
	InteractionProviderStates,
	ProviderStateHandler,
} from "./provider-states.js";
import { isRecursiveSubset } from "./subset.js";

export interface ProviderStub {
	readonly name: string;
	handle(request: PactRequest): PactResponse | Promise<PactResponse>;
}

// domain-view: readonly verification outcome; data-models/contract-harness.proto InteractionFailure is its wire form.
export interface InteractionFailure {
	readonly description: string;
	readonly reason: string;
}

// domain-view: readonly verification outcome aggregate; data-models/contract-harness.proto VerificationReport is its wire form.
export interface VerificationReport {
	readonly providerName: string;
	readonly ok: boolean;
	readonly failures: readonly InteractionFailure[];
}

export interface VerifyPactOptions {
	/**
	 * Pact v3 response matching rules, `parseResponseMatchingRules` of the same
	 * document: an interaction that declares rules has its body compared under
	 * them (`matchResponseBody`), every other by value.
	 */
	readonly responseMatchingRules?: readonly InteractionMatchingRules[];
	/**
	 * Pact v3 provider states, `parseProviderStates` of the same document. Each
	 * interaction's states are set up by `stateHandlers`, in order and with
	 * their params, before it is sent; a state without a handler, or whose
	 * handler throws, fails that interaction, which is then not sent. Without
	 * this option states are not set up, as before.
	 */
	readonly providerStates?: readonly InteractionProviderStates[];
	readonly stateHandlers?: Readonly<Record<string, ProviderStateHandler>>;
}

/** What a per-interaction reading of the document must agree with: the request it was read from. */
interface ReadFromInteraction {
	readonly request: Pick<PactRequest, "method" | "path">;
}

/** `read`, one per interaction of `pact`, or why it was read from another pact. */
function alignedWith<T extends ReadFromInteraction>(
	pact: PactDocument,
	read: readonly T[] | undefined,
	what: string,
): readonly (T | undefined)[] | string {
	if (read === undefined) return pact.interactions.map(() => undefined);
	if (read.length !== pact.interactions.length) {
		return `${what} were read from another pact: ${read.length} interactions, this pact has ${pact.interactions.length}`;
	}
	const stranger = read.findIndex((entry, index) => {
		const request = pact.interactions[index]?.request;
		return (
			request?.method !== entry.request.method ||
			request.path !== entry.request.path
		);
	});
	return stranger === -1
		? read
		: `${what} were read from another pact: interaction ${stranger} is ${read[stranger]?.request.method} ${read[stranger]?.request.path} there`;
}

/** Set up every state `declared` names; the first that cannot be is the reason. */
async function setUpStates(
	declared: InteractionProviderStates | undefined,
	handlers: Readonly<Record<string, ProviderStateHandler>>,
): Promise<string | undefined> {
	for (const state of declared?.states ?? []) {
		const handler = Object.hasOwn(handlers, state.name)
			? handlers[state.name]
			: undefined;
		if (handler === undefined) {
			return `provider state ${JSON.stringify(state.name)} has no handler`;
		}
		try {
			await handler(state.params);
		} catch (error) {
			return `provider state ${JSON.stringify(state.name)} could not be set up: ${error instanceof Error ? error.message : String(error)}`;
		}
	}
	return undefined;
}

export async function verifyPact(
	pact: PactDocument,
	provider: ProviderStub,
	options: VerifyPactOptions = {},
): Promise<VerificationReport> {
	const failures: InteractionFailure[] = [];

	if (provider.name !== pact.provider.name) {
		failures.push({
			description: "provider identity",
			reason: `provider expected ${pact.provider.name} but got ${provider.name}`,
		});
	}

	const matching = alignedWith(
		pact,
		options.responseMatchingRules,
		"matching rules",
	);
	const states = alignedWith(pact, options.providerStates, "provider states");
	if (!Array.isArray(matching)) {
		failures.push({ description: "matching rules", reason: String(matching) });
	}
	if (!Array.isArray(states)) {
		failures.push({ description: "provider states", reason: String(states) });
	}
	if (!Array.isArray(matching) || !Array.isArray(states)) {
		return { providerName: provider.name, ok: false, failures };
	}

	for (const [index, interaction] of pact.interactions.entries()) {
		if (options.providerStates !== undefined) {
			const unready = await setUpStates(
				states[index],
				options.stateHandlers ?? {},
			);
			if (unready !== undefined) {
				failures.push({
					description: interaction.description,
					reason: unready,
				});
				continue;
			}
		}
		const actual = await provider.handle(interaction.request);
		const expected = interaction.response;

		if (actual.status !== expected.status) {
			failures.push({
				description: interaction.description,
				reason: `status expected ${expected.status} but got ${actual.status}`,
			});
			continue;
		}

		if (expected.headers) {
			let headerFailure: string | undefined;
			for (const [key, value] of Object.entries(expected.headers)) {
				const actualValue = actual.headers?.[key];
				if (actualValue !== value) {
					headerFailure = `header ${key} expected ${JSON.stringify(value)} but got ${JSON.stringify(actualValue)}`;
					break;
				}
			}
			if (headerFailure) {
				failures.push({
					description: interaction.description,
					reason: headerFailure,
				});
				continue;
			}
		}

		const rules = matching[index]?.rules ?? [];
		if (expected.body !== undefined && rules.length > 0) {
			// SAFETY: a pact body and a provider's parsed answer are JSON values.
			const reason = matchResponseBody(
				rules,
				expected.body as PactJsonValue,
				actual.body as PactJsonValue | undefined,
			);
			if (reason !== undefined) {
				failures.push({ description: interaction.description, reason });
			}
		} else if (expected.body !== undefined) {
			if (!isRecursiveSubset(expected.body, actual.body)) {
				// SAFETY: a pact body and a provider's parsed answer are JSON values.
				const mismatch = findBodyMismatch(
					expected.body as PactJsonValue,
					actual.body as PactJsonValue | undefined,
				);
				failures.push({
					description: interaction.description,
					reason:
						mismatch ??
						"response body is not a superset of pact-declared fields",
				});
			}
		}
	}

	return {
		providerName: provider.name,
		ok: failures.length === 0,
		failures,
	};
}

const tagOf = Object.prototype.toString;

/** A JSON object (`isRecursiveSubset` reads any non-array object as one). */
function isRecord(
	value: PactJsonValue | undefined,
): value is { readonly [key: string]: PactJsonValue } {
	return value !== null && tagOf.call(value) === "[object Object]";
}

/**
 * Where a body that is not a recursive superset of the pact's first differs:
 * descends through objects only, as it always has, and names the field.
 */
function findBodyMismatch(
	expected: PactJsonValue | undefined,
	actual: PactJsonValue | undefined,
	path = "$",
): string | undefined {
	if (isRecursiveSubset(expected, actual, path)) {
		return undefined;
	}

	if (!isRecord(expected)) {
		return `body field ${path} does not match`;
	}

	if (!isRecord(actual)) {
		return `body field ${path} is missing`;
	}

	for (const key of Object.keys(expected)) {
		const childPath = `${path}.${key}`;
		if (!(key in actual)) {
			return `body field ${childPath} is missing`;
		}
		const nested = findBodyMismatch(expected[key], actual[key], childPath);
		if (nested) {
			return nested;
		}
	}

	return `body field ${path} does not match`;
}
