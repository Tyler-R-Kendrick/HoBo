export const TOPOLOGY_CONTRACT_VERSION = "hobo.topology-objects/v1" as const;

export interface ProviderSelection {
	readonly kind: "provider-selection";
	readonly providerId: string;
	readonly selector: string;
	readonly options: Readonly<Record<string, unknown>>;
}

export interface BindleResourceDescriptor {
	readonly kind: string;
	readonly name: string;
	readonly stableId: string;
	readonly portRef: readonly string[];
	readonly providerAgnostic: true;
}

export interface BindleScope {
	readonly kind: "bindle";
	readonly contract: typeof TOPOLOGY_CONTRACT_VERSION;
	readonly name: string;
	readonly source: "programmatic";
	readonly configFile: false;
	readonly providerAgnostic: true;
	readonly providerIds: readonly [];
	readonly resources: readonly BindleResourceDescriptor[];
}

export interface BindleCollector {
	use(resource: BindleResourceInput): BindleResourceDescriptor;
}

type BindleResourceShape = {
	readonly toDescriptor?: () => BindleResourceDescriptor;
	readonly kind?: string;
	readonly name?: string;
	readonly stableId?: string;
	readonly portRef?: readonly string[];
	readonly provider?: string;
	readonly defaultProvider?: unknown;
	readonly tiers?: unknown;
	readonly bindings?: unknown;
	readonly providerAnnotations?: unknown;
	readonly options?: { readonly providerOptions?: unknown };
	readonly annotations?: { readonly with?: unknown };
};

export type BindleResourceInput =
	| BindleResourceDescriptor
	| BindleResourceShape;

export function bindleScope(
	name: string,
	builder: (collector: BindleCollector) => void,
): BindleScope {
	requireName("bindle name", name);
	if (typeof builder !== "function") {
		throw new TypeError("bindle builder must be a function");
	}

	const resources: BindleResourceDescriptor[] = [];
	const byStableId = new Set<string>();
	const collector: BindleCollector = Object.freeze({
		use(resource: BindleResourceInput) {
			assertNoProviderSpecificFields(resource);
			const descriptor = normalizeResourceDescriptor(resource);
			assertNoProviderSpecificFields(descriptor);
			if (byStableId.has(descriptor.stableId)) {
				throw new Error(`duplicate Bindle resource ${descriptor.stableId}`);
			}
			byStableId.add(descriptor.stableId);
			resources.push(descriptor);
			return descriptor;
		},
	});

	builder(collector);

	return deepFreeze({
		kind: "bindle",
		contract: TOPOLOGY_CONTRACT_VERSION,
		name,
		source: "programmatic",
		configFile: false,
		providerAgnostic: true,
		providerIds: [],
		resources,
	});
}

export function descriptorFromHandle(handle: {
	readonly kind: string;
	readonly name: string;
	readonly port?: string;
}): BindleResourceDescriptor {
	const kind = handle.kind === "resource" ? "data" : handle.kind;
	const port =
		handle.port ??
		(kind === "service" || kind === "container" ? "wasi:http" : "hobo:data");
	return deepFreeze({
		kind,
		name: handle.name,
		stableId: `${kind}:${handle.name}`,
		portRef: [port],
		providerAgnostic: true,
	});
}

function normalizeResourceDescriptor(
	resource: BindleResourceInput,
): BindleResourceDescriptor {
	const shape = resource as BindleResourceShape;
	const descriptor =
		typeof shape.toDescriptor === "function"
			? shape.toDescriptor()
			: (resource as BindleResourceDescriptor);
	if (!isPlainObject(descriptor)) {
		throw new TypeError("Bindle resources must be descriptor objects");
	}

	const kind = String(descriptor.kind);
	const resourceName = String(descriptor.name);
	const stableId = String(descriptor.stableId);
	requireName("resource kind", kind);
	requireName("resource name", resourceName);
	requireName("resource stableId", stableId);
	if (!Array.isArray(descriptor.portRef)) {
		throw new TypeError(`resource ${stableId} portRef must be an array`);
	}
	assertNoProviderSpecificFields(descriptor);

	return deepFreeze({
		kind,
		name: resourceName,
		stableId,
		portRef: [...descriptor.portRef],
		providerAgnostic: true,
	});
}

export function assertNoProviderSpecificFields(
	value: BindleResourceInput,
): void {
	if (!value || typeof value !== "object") return;
	const shape = value as BindleResourceShape;
	const annotations = shape.annotations?.with;
	const providerOptions = shape.options?.providerOptions;
	if (
		shape.provider ||
		shape.defaultProvider ||
		shape.tiers ||
		shape.bindings ||
		shape.providerAnnotations ||
		providerOptions ||
		annotations
	) {
		throw new Error(
			"provider-specific options belong on Camp mappings, not Bindle resources",
		);
	}
}

function requireName(label: string, value: string): void {
	if (typeof value !== "string" || value.length === 0) {
		throw new TypeError(`${label} must be a non-empty string`);
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) {
		return value;
	}
	for (const child of Object.values(value)) {
		deepFreeze(child);
	}
	return Object.freeze(value);
}
