/**
 * The one parser boundary of @hobo/provider-railway.
 *
 * Everything this package is asked to realize arrives from somewhere else: a
 * deploy plan assembled by the yard placement plane, a port string read out of
 * a manifest, an output map produced by whatever ran the deploy. Those values
 * cross exactly one parser here and come out as refined domain types. No
 * function past this file re-checks a port, a name, or a binding value —
 * downstream code cannot even spell the bad case, because `RailwayPortKind` has
 * no fourth member and `RailwayResourcePlan.name` cannot hold a string that is
 * not a DNS label.
 *
 * `data-models/provider_railway.proto` is the wire view of these shapes and
 * `data-models/provider_railway.cue` carries the invariants enforced below.
 */

import {
	EQUIVALENCE_CLASSES,
	INITIAL_CAPABILITY_PORTS,
} from "./equivalence.js";

/** Every port the equivalence table actually claims — derived, not restated. */
export const RAILWAY_PORTS = Object.freeze(
	INITIAL_CAPABILITY_PORTS.map((key) => EQUIVALENCE_CLASSES[key].port),
) as readonly ("compute" | "kv" | "queue")[];

export type RailwayPortKind = (typeof RAILWAY_PORTS)[number];

/** A feature name as Matching spells them: lowercase, hyphenated, no spaces. */
export type RailwayFeature = string & {
	readonly __railwayFeature: unique symbol;
};

/** A name safe to become a DNS label in a named endpoint (ADR-0130). */
export type RailwayResourceName = string & {
	readonly __railwayResourceName: unique symbol;
};

// domain-view: richer than the wire form on purpose — `name` is a branded DNS label and `port` is the closed union the equivalence table supports, so an unrealizable plan is unrepresentable rather than merely invalid. No buf codegen is wired for this package, so data-models/provider_railway.proto is the design-time view of this record.
export type RailwayResourcePlan = {
	readonly name: RailwayResourceName;
	readonly port: RailwayPortKind;
	readonly require: readonly RailwayFeature[];
	readonly prefer: readonly RailwayFeature[];
};

/** Deploy outputs handed back to `client()`: printable, single-line values. */
export type RailwayBindings = Readonly<Record<string, string>>;

// public-contract: stable parser error code exposed to callers.
export const RAILWAY_REJECTED_CODE = "HOBO_RAILWAY_INPUT_REJECTED" as const;

export class RailwayInputRejectedError extends Error {
	readonly code = RAILWAY_REJECTED_CODE;
	readonly field: string;

	constructor(field: string, reason: string) {
		super(`railway rejected ${field}: ${reason}`);
		this.name = "RailwayInputRejectedError";
		this.field = field;
	}
}

const DNS_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/u;
const FEATURE = /^[a-z][a-z0-9-]*$/u;
const CONTROL_CHARACTER = /\p{Cc}/u;
const MAX_BINDING_LENGTH = 2048;

function isPrintableLine(value: string): boolean {
	return value.length <= MAX_BINDING_LENGTH && !CONTROL_CHARACTER.test(value);
}
const BINDING_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u;

function record(
	value: unknown,
	field: string,
): Readonly<Record<string, unknown>> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new RailwayInputRejectedError(field, "expected an object");
	}
	return value as Readonly<Record<string, unknown>>;
}

/**
 * A port string becomes one of the ports this provider realizes, or nothing.
 * Matching asks providers about ports they do not have, so "not mine" is a
 * normal answer and lives in the return type rather than in an exception.
 */
export function railwayPortOrUndefined(
	value: unknown,
): RailwayPortKind | undefined {
	return typeof value === "string" &&
		(RAILWAY_PORTS as readonly string[]).includes(value)
		? (value as RailwayPortKind)
		: undefined;
}

/** The same question, asked where "not mine" is a contract violation. */
export function parseRailwayPort(
	value: unknown,
	field = "port",
): RailwayPortKind {
	const port = railwayPortOrUndefined(value);
	if (port === undefined) {
		throw new RailwayInputRejectedError(
			field,
			`railway realizes ${RAILWAY_PORTS.join(", ")}, not ${JSON.stringify(value)}`,
		);
	}
	return port;
}

export function parseRailwayResourceName(
	value: unknown,
	field = "name",
): RailwayResourceName {
	if (typeof value !== "string" || !DNS_LABEL.test(value)) {
		throw new RailwayInputRejectedError(
			field,
			"expected a DNS label (lowercase alphanumeric and hyphens, 1-63 chars)",
		);
	}
	return value as RailwayResourceName;
}

function parseFeatures(
	value: unknown,
	field: string,
): readonly RailwayFeature[] {
	if (value === undefined) return Object.freeze([]);
	if (!Array.isArray(value)) {
		throw new RailwayInputRejectedError(field, "expected an array of features");
	}
	return Object.freeze(
		value.map((entry) => {
			if (typeof entry !== "string" || !FEATURE.test(entry)) {
				throw new RailwayInputRejectedError(
					field,
					`feature names are lowercase and hyphenated; got ${JSON.stringify(entry)}`,
				);
			}
			return entry as RailwayFeature;
		}),
	);
}

/**
 * The deploy plane's plan becomes a plan this provider can realize, or the
 * call fails here rather than three frames later inside a driver program.
 */
export function parseRailwayResourcePlan(value: unknown): RailwayResourcePlan {
	const raw = record(value, "plan");
	return Object.freeze({
		name: parseRailwayResourceName(raw.name),
		port: parseRailwayPort(raw.port),
		require: parseFeatures(raw.require, "plan.require"),
		prefer: parseFeatures(raw.prefer, "plan.prefer"),
	});
}

/**
 * Deploy outputs are locators — hostnames, ids, secret refs. A control
 * character or a multi-kilobyte blob in this map means something upstream
 * handed us a document, not a binding, and possibly a credential with it.
 */
export function parseRailwayBindings(value: unknown): RailwayBindings {
	const raw = record(value, "bindings");
	const parsed: Record<string, string> = {};
	for (const [key, entry] of Object.entries(raw)) {
		if (!BINDING_KEY.test(key)) {
			throw new RailwayInputRejectedError(
				"bindings",
				`binding key ${JSON.stringify(key)} is not an identifier`,
			);
		}
		if (typeof entry !== "string" || !isPrintableLine(entry)) {
			throw new RailwayInputRejectedError(
				`bindings.${key}`,
				"expected a printable single-line string of at most 2048 characters",
			);
		}
		parsed[key] = entry;
	}
	return Object.freeze(parsed);
}
