import type { RoutingPolicy, SparseBudgetPolicy } from "./policy-planner.js";

export type ExampleUiKind = "counter" | "notes" | "todos" | "queue";
export type ExamplePolicy = SparseBudgetPolicy;

export interface ExampleYard {
	readonly id: string;
	readonly targetId: string;
	readonly providerId: string;
	readonly campId: string;
}

export type RuntimeAction =
	| "health"
	| "read"
	| "increment"
	| "reset"
	| "list"
	| "create"
	| "delete"
	| "toggle"
	| "enqueue"
	| "drain";

export interface ExampleRuntimeDescriptor {
	readonly schemaVersion: "hobo.try-runtime/v1";
	readonly resources: Readonly<
		Record<string, { readonly kind: "kv" | "queue"; readonly initial: unknown }>
	>;
	readonly routes: readonly {
		readonly method: "GET" | "POST" | "PATCH" | "DELETE";
		readonly path: string;
		readonly action: RuntimeAction;
		readonly resource?: string;
		readonly key?: string;
	}[];
}

export interface ExampleTopology {
	readonly homeStation: {
		readonly id: string;
		readonly registeredYardIds: readonly string[];
	};
	readonly yards: readonly ExampleYard[];
	readonly junction: { readonly id: string; readonly yardIds: readonly string[] };
	readonly allowedYardIds: readonly string[] | null;
}

export interface ExampleCatalogEntry {
	readonly id: string;
	readonly title: string;
	readonly blurb: string;
	readonly tags: readonly string[];
	readonly needs: readonly string[];
	readonly ui: ExampleUiKind;
	readonly entry: string;
	readonly sourcePath: string;
	readonly source: string;
	readonly appPolicy: ExamplePolicy;
	readonly deploymentPolicy: ExamplePolicy;
	readonly topology: ExampleTopology;
	readonly runtime: ExampleRuntimeDescriptor;
}

const METHODS = ["GET", "POST", "PATCH", "DELETE"] as const;
const ACTIONS = [
	"health",
	"read",
	"increment",
	"reset",
	"list",
	"create",
	"delete",
	"toggle",
	"enqueue",
	"drain",
] as const;

export function parseExamplesCatalog(value: unknown): readonly ExampleCatalogEntry[] {
	if (!Array.isArray(value)) throw new TypeError("Examples catalog must be an array");
	return value.map((entry, index) => parseExample(entry, `catalog[${index}]`));
}

function parseExample(value: unknown, label: string): ExampleCatalogEntry {
	const input = record(value, label);
	const ui = oneOf(input.ui, `${label}.ui`, ["counter", "notes", "todos", "queue"] as const);
	const topology = parseTopology(input.topology, `${label}.topology`);
	const yardIds = new Set(topology.yards.map(({ id }) => id));
	if (
		topology.homeStation.registeredYardIds.some((id) => !yardIds.has(id)) ||
		topology.junction.yardIds.some((id) => !yardIds.has(id)) ||
		topology.allowedYardIds?.some((id) => !topology.junction.yardIds.includes(id))
	) {
		throw new TypeError(`${label}.topology references an unknown Yard`);
	}
	return {
		id: string(input.id, `${label}.id`),
		title: string(input.title, `${label}.title`),
		blurb: string(input.blurb, `${label}.blurb`),
		tags: strings(input.tags, `${label}.tags`),
		needs: strings(input.needs, `${label}.needs`),
		ui,
		entry: string(input.entry, `${label}.entry`),
		sourcePath: string(input.sourcePath, `${label}.sourcePath`),
		source: string(input.source, `${label}.source`),
		appPolicy: parsePolicy(input.appPolicy, `${label}.appPolicy`),
		deploymentPolicy: parsePolicy(input.deploymentPolicy, `${label}.deploymentPolicy`),
		topology,
		runtime: parseRuntime(input.runtime, `${label}.runtime`),
	};
}

function parseTopology(value: unknown, label: string): ExampleTopology {
	const input = record(value, label);
	const home = record(input.homeStation, `${label}.homeStation`);
	const junction = record(input.junction, `${label}.junction`);
	if (!Array.isArray(input.yards) || input.yards.length === 0) {
		throw new TypeError(`${label}.yards must be a non-empty array`);
	}
	const yards = input.yards.map((value, index) => {
		const yard = record(value, `${label}.yards[${index}]`);
		return {
			id: string(yard.id, `${label}.yards[${index}].id`),
			targetId: string(yard.targetId, `${label}.yards[${index}].targetId`),
			providerId: string(yard.providerId, `${label}.yards[${index}].providerId`),
			campId: string(yard.campId, `${label}.yards[${index}].campId`),
		};
	});
	if (new Set(yards.map(({ id }) => id)).size !== yards.length) {
		throw new TypeError(`${label}.yards must have unique ids`);
	}
	return {
		homeStation: {
			id: string(home.id, `${label}.homeStation.id`),
			registeredYardIds: strings(home.registeredYardIds, `${label}.homeStation.registeredYardIds`),
		},
		yards,
		junction: {
			id: string(junction.id, `${label}.junction.id`),
			yardIds: strings(junction.yardIds, `${label}.junction.yardIds`),
		},
		allowedYardIds:
			input.allowedYardIds === null
				? null
				: strings(input.allowedYardIds, `${label}.allowedYardIds`),
	};
}

function parseRuntime(value: unknown, label: string): ExampleRuntimeDescriptor {
	const input = record(value, label);
	if (input.schemaVersion !== "hobo.try-runtime/v1") {
		throw new TypeError(`${label}.schemaVersion is invalid`);
	}
	const resourcesInput = record(input.resources, `${label}.resources`);
	const resources: Record<string, { kind: "kv" | "queue"; initial: unknown }> = {};
	for (const [name, raw] of Object.entries(resourcesInput)) {
		const resource = record(raw, `${label}.resources.${name}`);
		resources[name] = {
			kind: oneOf(resource.kind, `${label}.resources.${name}.kind`, ["kv", "queue"] as const),
			initial: resource.initial,
		};
	}
	if (!Array.isArray(input.routes) || input.routes.length === 0) {
		throw new TypeError(`${label}.routes must be a non-empty array`);
	}
	const routes = input.routes.map((raw, index) => {
		const route = record(raw, `${label}.routes[${index}]`);
		const resource = route.resource === undefined ? undefined : string(route.resource, `${label}.routes[${index}].resource`);
		if (resource !== undefined && !(resource in resources)) {
			throw new TypeError(`${label}.routes[${index}] references an unknown resource`);
		}
		return {
			method: oneOf(route.method, `${label}.routes[${index}].method`, METHODS),
			path: string(route.path, `${label}.routes[${index}].path`),
			action: oneOf(route.action, `${label}.routes[${index}].action`, ACTIONS),
			...(resource === undefined ? {} : { resource }),
			...(route.key === undefined ? {} : { key: string(route.key, `${label}.routes[${index}].key`) }),
		};
	});
	return { schemaVersion: "hobo.try-runtime/v1", resources, routes };
}

function parsePolicy(value: unknown, label: string): ExamplePolicy {
	const input = record(value, label);
	const output: Record<string, unknown> = {};
	if (input.preferLocal !== undefined) output.preferLocal = boolean(input.preferLocal, `${label}.preferLocal`);
	if (input.routing !== undefined) output.routing = oneOf(input.routing, `${label}.routing`, ["local-first", "latency-first", "cost-first"] as const) satisfies RoutingPolicy;
	if (input.redundancy !== undefined) output.redundancy = oneOf(input.redundancy, `${label}.redundancy`, ["none", "active-passive", "active-active", "mirror"] as const);
	if (input.maxReplicas !== undefined) output.maxReplicas = integer(input.maxReplicas, `${label}.maxReplicas`, 0);
	if (input.maxConcurrent !== undefined) output.maxConcurrent = integer(input.maxConcurrent, `${label}.maxConcurrent`, 1);
	if (input.monthlySpendCapUsd !== undefined) output.monthlySpendCapUsd = number(input.monthlySpendCapUsd, `${label}.monthlySpendCapUsd`);
	if (input.resourcePool !== undefined) output.resourcePool = strings(input.resourcePool, `${label}.resourcePool`).map((entry) => oneOf(entry, `${label}.resourcePool`, ["local", "anonymous-remote", "paid-remote"] as const));
	return output as ExamplePolicy;
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
	return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
	return value;
}

function strings(value: unknown, label: string): string[] {
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new TypeError(`${label} must be a string array`);
	return [...new Set(value)];
}

function boolean(value: unknown, label: string): boolean {
	if (typeof value !== "boolean") throw new TypeError(`${label} must be boolean`);
	return value;
}

function number(value: unknown, label: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new TypeError(`${label} must be a non-negative number`);
	return value;
}

function integer(value: unknown, label: string, minimum: number): number {
	const parsed = number(value, label);
	if (!Number.isInteger(parsed) || parsed < minimum) throw new TypeError(`${label} must be an integer >= ${minimum}`);
	return parsed;
}

function oneOf<const T extends readonly string[]>(value: unknown, label: string, choices: T): T[number] {
	if (typeof value !== "string" || !choices.includes(value)) throw new TypeError(`${label} is invalid`);
	return value as T[number];
}
