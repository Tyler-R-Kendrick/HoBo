import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tsImport } from "tsx/esm/api";

import type { BindleDefinition } from "@hobo/bindles";

import type { RoutingPolicy } from "./policy-planner.js";
import type {
	ExampleCatalogEntry,
	ExamplePolicy,
	ExampleRuntimeDescriptor,
	ExampleTopology,
	ExampleUiKind,
	ExampleYard,
	RuntimeAction,
} from "./catalog-contract.js";
import { deriveWebGuestFromBindle } from "./derive-web-guest.js";
import { synthesizeTryRuntimeFromDeclared } from "./synthesize-try-runtime.js";

export type {
	ExampleCatalogEntry,
	ExamplePolicy,
	ExampleRuntimeDescriptor,
	ExampleTopology,
	ExampleUiKind,
	ExampleYard,
	RuntimeAction,
} from "./catalog-contract.js";

const DEFAULT_REPO_ROOT = fileURLToPath(
	new URL("../../../../", import.meta.url),
);
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export async function loadExamplesCatalog(
	repoRoot = DEFAULT_REPO_ROOT,
): Promise<readonly ExampleCatalogEntry[]> {
	const trySiteRoot = path.join(repoRoot, "examples", "try-site");
	const examplesRoot = path.join(trySiteRoot, "apps");
	const pool = parseYardPool(
		JSON.parse(
			await readFile(path.join(trySiteRoot, "yards.json"), "utf8"),
		) as unknown,
	);
	const directories = (await readdir(examplesRoot, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
	const catalog: ExampleCatalogEntry[] = [];

	for (const directory of directories) {
		const exampleRoot = path.join(examplesRoot, directory);
		let metaText: string;
		try {
			metaText = await readFile(path.join(exampleRoot, "meta.json"), "utf8");
		} catch (error) {
			if (isMissingFile(error)) continue;
			throw error;
		}
		const topologyText = await readFile(path.join(exampleRoot, "yard.json"), "utf8");

		const meta = parseMeta(JSON.parse(metaText) as unknown, directory);
		const descriptor = parseDescriptor(
			JSON.parse(topologyText) as unknown,
			directory,
			pool,
		);
		const appPath = path.join(exampleRoot, meta.entry);
		const appSource = await readFile(appPath, "utf8");
		let handlersFile = "";
		try {
			handlersFile = await readFile(path.join(exampleRoot, "handlers.txt"), "utf8");
		} catch (error) {
			if (!isMissingFile(error)) throw error;
		}
		const appModule = (await tsImport(appPath, import.meta.url)) as {
			readonly default?: unknown;
			readonly runtime?: unknown;
		};

		const { runtime, guestHandlersSource } = resolveExampleRuntime(
			meta.id,
			meta.deployKind,
			appSource,
			appModule,
			handlersFile,
		);
		const bindleContainers = extractBindleContainers(appModule.default);
		const bindleWebApp = extractBindleWebApp(appModule.default);
		if (
			meta.deployKind === "local-bridge" &&
			bindleContainers.length === 0 &&
			bindleWebApp === null
		) {
			throw new TypeError(
				`${meta.id}: local-bridge Bindle must declare b.web(waspApp|convexApp(...)) and/or b.container({ image }) resources to ship`,
			);
		}

		catalog.push({
			...meta,
			source: `${appSource.trimEnd()}\n`,
			handlersSource: guestHandlersSource,
			bindleContainers,
			bindleWebApp,
			runtime,
			...descriptor,
		});
	}

	return catalog;
}

const BRIDGE_PLACEHOLDER_RUNTIME: ExampleRuntimeDescriptor = {
	schemaVersion: "hobo.try-runtime/v1",
	resources: {},
	routes: [{ method: "GET", path: "/health", action: "health" }],
};

function extractBindleWebApp(
	definition: unknown,
): { readonly framework: string; readonly root: string } | null {
	if (!definition || typeof definition !== "object") return null;
	const resources = (definition as { resources?: unknown }).resources;
	if (!resources || typeof resources !== "object") return null;
	for (const resource of Object.values(resources as Record<string, unknown>)) {
		if (!resource || typeof resource !== "object") continue;
		if ((resource as { kind?: unknown }).kind !== "web") continue;
		const annotations = (resource as { annotations?: unknown }).annotations;
		if (!Array.isArray(annotations)) continue;
		const webapp = annotations.find(
			(entry) =>
				entry &&
				typeof entry === "object" &&
				(entry as { option?: unknown }).option === "webapp" &&
				(entry as { provider?: unknown }).provider === "hobo",
		) as { config?: Record<string, unknown> } | undefined;
		const framework = webapp?.config?.framework;
		const root = webapp?.config?.root;
		if (typeof framework === "string" && typeof root === "string") {
			return { framework, root };
		}
	}
	return null;
}

function extractBindleContainers(
	definition: unknown,
): readonly { readonly name: string; readonly image: string }[] {
	if (!definition || typeof definition !== "object") return [];
	const resources = (definition as { resources?: unknown }).resources;
	if (!resources || typeof resources !== "object") return [];
	const out: { name: string; image: string }[] = [];
	for (const [name, resource] of Object.entries(
		resources as Record<string, unknown>,
	)) {
		if (!resource || typeof resource !== "object") continue;
		if ((resource as { kind?: unknown }).kind !== "container") continue;
		const annotations = (resource as { annotations?: unknown }).annotations;
		if (!Array.isArray(annotations)) continue;
		const dep = annotations.find(
			(entry) =>
				entry &&
				typeof entry === "object" &&
				(entry as { option?: unknown }).option === "dependency" &&
				(entry as { provider?: unknown }).provider === "hobo",
		) as { config?: { image?: unknown } } | undefined;
		const image = dep?.config?.image;
		if (typeof image === "string" && image.length > 0) {
			out.push({ name, image });
		}
	}
	return out;
}

function resolveExampleRuntime(
	id: string,
	deployKind: "browser-wit" | "local-bridge",
	appSource: string,
	appModule: { readonly default?: unknown; readonly runtime?: unknown },
	handlersFile: string,
): {
	readonly runtime: ExampleRuntimeDescriptor;
	readonly guestHandlersSource: string;
} {
	if (deployKind === "local-bridge") {
		// Browser WIT guest unused — ship path deploys Bindle container images.
		return { runtime: BRIDGE_PLACEHOLDER_RUNTIME, guestHandlersSource: "" };
	}

	const bindleDef = appModule.default as BindleDefinition | undefined;
	const hasWebEntrypoint =
		bindleDef &&
		typeof bindleDef === "object" &&
		typeof bindleDef.entrypoint === "function" &&
		typeof bindleDef.entrypoint("web") === "function";

	if (hasWebEntrypoint && appModule.runtime === undefined) {
		return deriveWebGuestFromBindle(bindleDef, appSource);
	}

	if (appModule.runtime !== undefined) {
		return {
			runtime: parseRuntime(appModule.runtime),
			guestHandlersSource: handlersFile.trim(),
		};
	}

	if (handlersFile.trim().length > 0) {
		return {
			runtime: synthesizeTryRuntimeFromDeclared(appSource),
			guestHandlersSource: handlersFile.trim(),
		};
	}

	throw new TypeError(
		`Example ${id}: export runtime, handlers.txt, or bindle default with b.web(Trainable)`,
	);
}

function parseMeta(value: unknown, directory: string) {
	const input = record(value, `${directory}/meta.json`);
	const id = string(input.id, "meta.id");
	if (!ID.test(id) || id !== directory) {
		throw new TypeError(`meta.id must match its example directory (${directory})`);
	}
	const entry = string(input.entry, "meta.entry");
	if (!/^[a-z0-9-]+\.(?:ts|mts)$/u.test(entry)) {
		throw new TypeError("meta.entry must be a local TypeScript filename");
	}
	const sourcePath = string(input.sourcePath, "meta.sourcePath");
	if (sourcePath !== `examples/try-site/apps/${id}/${entry}`) {
		throw new TypeError(
			`meta.sourcePath must be examples/try-site/apps/${id}/${entry}`,
		);
	}
	const ui = string(input.ui, "meta.ui");
	if (!["counter", "hello", "notes", "todos", "queue", "saas"].includes(ui)) {
		throw new TypeError(
			"meta.ui must be counter, hello, notes, todos, queue, or saas",
		);
	}
	const deployKindRaw =
		input.deployKind === undefined ? "browser-wit" : string(input.deployKind, "meta.deployKind");
	if (deployKindRaw !== "browser-wit" && deployKindRaw !== "local-bridge") {
		throw new TypeError("meta.deployKind must be browser-wit or local-bridge");
	}
	const deployKind: "browser-wit" | "local-bridge" = deployKindRaw;
	return {
		id,
		title: string(input.title, "meta.title"),
		blurb: string(input.blurb, "meta.blurb"),
		tags: strings(input.tags, "meta.tags"),
		needs: strings(input.needs, "meta.needs"),
		ui: ui as ExampleUiKind,
		deployKind,
		entry,
		sourcePath,
	};
}

function parseDescriptor(
	value: unknown,
	directory: string,
	pool: ReturnType<typeof parseYardPool>,
) {
	const input = record(value, `${directory}/yard.json`);
	if (input.schemaVersion !== "hobo.try-example/v1") {
		throw new TypeError("yard.schemaVersion must be hobo.try-example/v1");
	}
	return {
		appPolicy: parsePolicy(input.appPolicy, "appPolicy"),
		deploymentPolicy: parsePolicy(input.deploymentPolicy, "deploymentPolicy"),
		topology: parseTopology(input.topology, pool),
	};
}

function parseYardPool(value: unknown) {
	const input = record(value, "yards.json");
	if (input.schemaVersion !== "hobo.try-yards/v1") {
		throw new TypeError("yards.schemaVersion must be hobo.try-yards/v1");
	}
	const homeStation = record(input.homeStation, "yards.homeStation");
	if (!Array.isArray(input.yards) || input.yards.length === 0) {
		throw new TypeError("yards.yards must contain provider-specific Yards");
	}
	const yards = input.yards.map((value, index) => parseYard(value, index));
	const ids = new Set(yards.map((yard) => yard.id));
	if (ids.size !== yards.length) throw new TypeError("Yard IDs must be unique");
	return {
		homeStationId: string(homeStation.id, "yards.homeStation.id"),
		yards,
		yardIds: ids,
	};
}

function parseYard(value: unknown, index: number): ExampleYard {
	const yard = record(value, `yards.yards[${index}]`);
	return {
		id: string(yard.id, `yards.yards[${index}].id`),
		targetId: string(yard.targetId, `yards.yards[${index}].targetId`),
		providerId: string(yard.providerId, `yards.yards[${index}].providerId`),
		campId: string(yard.campId, `yards.yards[${index}].campId`),
	};
}

function parsePolicy(value: unknown, label: string): ExamplePolicy {
	const input = record(value, label);
	const output: Record<string, unknown> = {};
	const known = new Set([
		"preferLocal",
		"routing",
		"redundancy",
		"maxReplicas",
		"maxConcurrent",
		"monthlySpendCapUsd",
		"resourcePool",
	]);
	for (const key of Object.keys(input)) {
		if (!known.has(key)) {
			throw new TypeError(`${label}.${key} is not a policy field`);
		}
	}
	if (input.preferLocal !== undefined) {
		output.preferLocal = boolean(input.preferLocal, `${label}.preferLocal`);
	}
	if (input.routing !== undefined) {
		const routing = string(input.routing, `${label}.routing`);
		if (!["local-first", "latency-first", "cost-first"].includes(routing)) {
			throw new TypeError(`${label}.routing is invalid`);
		}
		output.routing = routing as RoutingPolicy;
	}
	if (input.redundancy !== undefined) {
		const redundancy = string(input.redundancy, `${label}.redundancy`);
		if (
			!["none", "active-passive", "active-active", "mirror"].includes(
				redundancy,
			)
		) {
			throw new TypeError(`${label}.redundancy is invalid`);
		}
		output.redundancy = redundancy;
	}
	if (input.maxReplicas !== undefined) {
		output.maxReplicas = integer(input.maxReplicas, `${label}.maxReplicas`, 0);
	}
	if (input.maxConcurrent !== undefined) {
		output.maxConcurrent = integer(input.maxConcurrent, `${label}.maxConcurrent`, 1);
	}
	if (input.monthlySpendCapUsd !== undefined) {
		output.monthlySpendCapUsd = finiteNumber(
			input.monthlySpendCapUsd,
			`${label}.monthlySpendCapUsd`,
			0,
		);
	}
	if (input.resourcePool !== undefined) {
		const resourcePool = strings(input.resourcePool, `${label}.resourcePool`);
		if (
			resourcePool.some(
				(entry) => !["local", "anonymous-remote", "paid-remote"].includes(entry),
			)
		) {
			throw new TypeError(`${label}.resourcePool contains an invalid class`);
		}
		output.resourcePool = resourcePool;
	}
	return output as ExamplePolicy;
}

function parseTopology(
	value: unknown,
	pool: ReturnType<typeof parseYardPool>,
): ExampleTopology {
	const input = record(value, "topology");
	const junction = record(input.junction, "topology.junction");
	const junctionYardIds = references(
		junction.yardIds,
		"topology.junction.yardIds",
		pool.yardIds,
	);
	const allowedYardIds =
		input.allowedYardIds === null || input.allowedYardIds === undefined
			? null
			: references(
					input.allowedYardIds,
					"topology.allowedYardIds",
					pool.yardIds,
				);
	const junctionMembers = new Set(junctionYardIds);
	if (allowedYardIds?.some((id) => !junctionMembers.has(id))) {
		throw new TypeError(
			"topology.allowedYardIds must be a subset of topology.junction.yardIds",
		);
	}
	return {
		homeStation: {
			id: pool.homeStationId,
			registeredYardIds: [...pool.yardIds],
		},
		yards: pool.yards,
		junction: {
			id: string(junction.id, "topology.junction.id"),
			yardIds: junctionYardIds,
		},
		allowedYardIds,
	};
}

function parseRuntime(value: unknown): ExampleRuntimeDescriptor {
	const input = record(value, "runtime.json");
	if (input.schemaVersion !== "hobo.try-runtime/v1") {
		throw new TypeError("runtime.schemaVersion must be hobo.try-runtime/v1");
	}
	const resourcesInput = record(input.resources, "runtime.resources");
	const resources: Record<
		string,
		{ kind: "kv" | "queue"; initial: unknown }
	> = {};
	for (const [name, value] of Object.entries(resourcesInput)) {
		const resource = record(value, `runtime.resources.${name}`);
		if (resource.kind !== "kv" && resource.kind !== "queue") {
			throw new TypeError(`runtime resource ${name} has an invalid kind`);
		}
		resources[name] = { kind: resource.kind, initial: resource.initial };
	}
	if (!Array.isArray(input.routes) || input.routes.length === 0) {
		throw new TypeError("runtime.routes must be a non-empty array");
	}
	const actions: readonly RuntimeAction[] = [
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
		"greet",
		"signup",
		"login",
		"logout",
		"me",
		"listProducts",
		"checkout",
		"listOrders",
		"adminListUsers",
	];
	const routes = input.routes.map((value, index) => {
		const route = record(value, `runtime.routes[${index}]`);
		const method = string(route.method, `runtime.routes[${index}].method`);
		const action = string(route.action, `runtime.routes[${index}].action`);
		if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) {
			throw new TypeError(`runtime.routes[${index}].method is invalid`);
		}
		if (!actions.includes(action as RuntimeAction)) {
			throw new TypeError(`runtime.routes[${index}].action is invalid`);
		}
		const resource =
			route.resource === undefined
				? undefined
				: string(route.resource, `runtime.routes[${index}].resource`);
		if (resource !== undefined && !(resource in resources)) {
			throw new TypeError(
				`runtime.routes[${index}] references an unknown resource`,
			);
		}
		const key =
			route.key === undefined
				? undefined
				: string(route.key, `runtime.routes[${index}].key`);
		return {
			method: method as ExampleRuntimeDescriptor["routes"][number]["method"],
			path: string(route.path, `runtime.routes[${index}].path`),
			action: action as RuntimeAction,
			...(resource === undefined ? {} : { resource }),
			...(key === undefined ? {} : { key }),
		};
	});
	return { schemaVersion: "hobo.try-runtime/v1", resources, routes };
}

function references(value: unknown, label: string, known: Set<string>) {
	const values = strings(value, label);
	if (values.some((id) => !known.has(id))) {
		throw new TypeError(`${label} references an unknown Yard`);
	}
	return values;
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object`);
	}
	return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new TypeError(`${label} must be a non-empty string`);
	}
	return value;
}

function strings(value: unknown, label: string): string[] {
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
		throw new TypeError(`${label} must be a string array`);
	}
	return [...new Set(value)];
}

function boolean(value: unknown, label: string): boolean {
	if (typeof value !== "boolean") throw new TypeError(`${label} must be boolean`);
	return value;
}

function integer(value: unknown, label: string, minimum: number): number {
	if (!Number.isInteger(value) || (value as number) < minimum) {
		throw new TypeError(`${label} must be an integer >= ${minimum}`);
	}
	return value as number;
}

function finiteNumber(value: unknown, label: string, minimum: number): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
		throw new TypeError(`${label} must be a finite number >= ${minimum}`);
	}
	return value;
}

function isMissingFile(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}
