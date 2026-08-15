/**
 * Property oracles over trainable functions and their blessed gold seeds.
 * Gold suites exact-match examples; silver suites run these checks.
 */
import { hasPrototypePollution } from "./manifest.js";
import { type InvariantVerdict, verdict } from "./model.js";

// public-contract: silver-fuzz report schema id
export const TRAINABLE_FUZZ_SCHEMA = "hobo.fuzz.trainable-verdict/v1" as const;

export type TrainableFn = (input: unknown) => unknown;

export interface TrainableFuzzSeed {
	readonly input: unknown;
	readonly output?: unknown;
}

export interface TrainableFuzzReport {
	readonly schema: typeof TRAINABLE_FUZZ_SCHEMA;
	readonly methodRef: string;
	readonly ok: boolean;
	readonly numRuns: number;
	readonly deterministic: boolean;
	readonly failClosed: boolean;
	readonly noPollution: boolean;
	readonly seedHolds: boolean;
	readonly bounded: boolean;
	readonly verdicts: readonly InvariantVerdict[];
}

export const TRAINABLE_OUTPUT_BOUND = 65_536;

const ASYNC_SENTINEL = Symbol("hobo.fuzz.async-trainable");

const GARBAGE_INPUTS: readonly unknown[] = [
	null,
	0,
	"",
	[],
	{ constructor: { admin: true } },
	{ __proto__: { admin: true } },
	{ toJSON: "nope" },
];

export function fuzzTrainable(
	fn: TrainableFn,
	seeds: readonly TrainableFuzzSeed[],
	opts: { methodRef?: string; numRuns?: number } = {},
): TrainableFuzzReport {
	const methodRef = opts.methodRef ?? "trainable";
	const numRuns = Math.max(1, opts.numRuns ?? 16);
	let failClosed = true;
	let sawAsync = false;
	const invokeOnce = (input: unknown): unknown => {
		const output = invoke(fn, input);
		if (output === ASYNC_SENTINEL) {
			sawAsync = true;
			return undefined;
		}
		return output;
	};
	const seedHolds = seeds.every((seed) => {
		if (!Object.hasOwn(seed, "output")) return true;
		return same(invokeOnce(seed.input), seed.output);
	});
	const deterministic = seeds.every((seed) =>
		same(invokeOnce(seed.input), invokeOnce(seed.input)),
	);
	const noPollution = seeds.every((seed) => {
		const output = invokeOnce(seed.input);
		return (
			!hasPrototypePollution(seed.input) &&
			!hasPrototypePollution(seed.output) &&
			!hasPrototypePollution(output)
		);
	});
	const bounded = seeds.every((seed) => withinBound(invokeOnce(seed.input)));
	const probes = [...GARBAGE_INPUTS, ...mutateSeeds(seeds, numRuns)];
	for (const input of probes) {
		const output = invokeOnce(input);
		if (hasPrototypePollution(output) || !withinBound(output)) {
			failClosed = false;
			break;
		}
	}
	if (sawAsync) failClosed = false;

	const verdicts = [
		flag(
			"trainable-seed-holds",
			seedHolds,
			"blessed gold seeds still match",
			"trainable drifted from a blessed gold seed",
		),
		flag(
			"trainable-deterministic",
			deterministic,
			"same input produced the same output",
			"trainable is not deterministic",
		),
		flag(
			"trainable-no-pollution",
			noPollution,
			"seeds and outputs have no prototype injection",
			"prototype pollution in a seed or output",
		),
		flag(
			"trainable-fail-closed",
			failClosed,
			"malformed input did not pollute or explode the bound",
			"malformed input escaped fail-closed checks",
		),
		flag(
			"trainable-bounded",
			bounded,
			"outputs stay under the silver size bound",
			"an output exceeded the silver size bound",
		),
	];
	return {
		schema: TRAINABLE_FUZZ_SCHEMA,
		methodRef,
		ok: verdicts.every((row) => row.ok),
		numRuns: probes.length,
		deterministic,
		failClosed,
		noPollution,
		seedHolds,
		bounded,
		verdicts,
	};
}

export function silverEvidenceFromCorpus(seeds: readonly TrainableFuzzSeed[]): {
	readonly deterministic: boolean;
	readonly failClosed: boolean;
	readonly noPollution: boolean;
	readonly seedHolds: boolean;
	readonly bounded: boolean;
} {
	return {
		deterministic: true,
		failClosed: true,
		noPollution: seeds.every(
			(seed) =>
				!hasPrototypePollution(seed.input) &&
				!hasPrototypePollution(seed.output),
		),
		seedHolds: false,
		bounded: seeds.every((seed) => withinBound(seed.output)),
	};
}

function flag(
	invariant: string,
	ok: boolean,
	pass: string,
	fail: string,
): InvariantVerdict {
	return verdict(invariant, ok, ok ? pass : fail);
}

function invoke(fn: TrainableFn, input: unknown): unknown {
	try {
		const output = fn(input);
		if (isThenable(output)) {
			return ASYNC_SENTINEL;
		}
		return output;
	} catch {
		return undefined;
	}
}

function isThenable(value: unknown): boolean {
	return Boolean(
		value &&
			typeof value === "object" &&
			"then" in value &&
			typeof (value as { then?: unknown }).then === "function",
	);
}

function withinBound(value: unknown): boolean {
	if (value === undefined) return true;
	try {
		return stable(value).length <= TRAINABLE_OUTPUT_BOUND;
	} catch {
		return false;
	}
}

function mutateSeeds(
	seeds: readonly TrainableFuzzSeed[],
	budget: number,
): unknown[] {
	const out: unknown[] = [];
	for (const seed of seeds.slice(0, budget)) {
		out.push(seed.input);
		if (Array.isArray(seed.input)) {
			out.push([...seed.input, null]);
			out.push([]);
			continue;
		}
		if (seed.input && typeof seed.input === "object") {
			out.push({ ...(seed.input as object), extra: true });
			out.push({});
			out.push({ constructor: { admin: true } });
		}
	}
	return out;
}

function same(left: unknown, right: unknown): boolean {
	return stable(left) === stable(right);
}

function stable(value: unknown, seen: WeakSet<object> = new WeakSet()): string {
	if (value === undefined) return "undefined";
	const kind = typeof value;
	if (kind === "bigint") return `${value}n`;
	if (kind === "symbol") return String(value);
	if (kind === "function") {
		return `fn:${(value as { name?: string }).name ?? "anonymous"}`;
	}
	if (kind === "number") {
		if (Number.isNaN(value)) return "NaN";
		if (Object.is(value, -0)) return "-0";
		if (!Number.isFinite(value)) return String(value);
	}
	if (value === null || kind !== "object") {
		try {
			return JSON.stringify(value);
		} catch {
			return kind;
		}
	}
	if (seen.has(value)) return '"[Cycle]"';
	seen.add(value);
	if (value instanceof Date) {
		return `Date:${Number.isNaN(value.getTime()) ? "Invalid" : value.toISOString()}`;
	}
	if (value instanceof RegExp) return String(value);
	if (value instanceof Map) {
		const entries = [...value.entries()].map(
			([key, entry]) => `${stable(key, seen)}=>${stable(entry, seen)}`,
		);
		return `Map:{${entries.join(",")}}`;
	}
	if (value instanceof Set) {
		return `Set:[${[...value].map((entry) => stable(entry, seen)).join(",")}]`;
	}
	if (Array.isArray(value)) {
		return `[${value.map((entry) => stable(entry, seen)).join(",")}]`;
	}
	const rec = value as Record<string, unknown>;
	return `{${Object.keys(rec)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stable(rec[key], seen)}`)
		.join(",")}}`;
}
