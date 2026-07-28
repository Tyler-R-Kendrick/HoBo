import { createHash } from "node:crypto";

import type { BindleDefinition, ProviderAnnotation } from "./types.js";

export const BINDLE_PROVIDER_SELECTION_FORBIDDEN =
	"bindle-provider-selection-forbidden" as const;

export const BINDLE_PROVIDER_SELECTION_REMEDIATION =
	"Provider selection belongs on a Yard. Declare or request a provider-specific Yard and attach this Bindle deployment to it." as const;

/** Platform annotations that are not cloud provider pins. */
const PLATFORM_PROVIDERS = new Set(["hobo", "hobo:build"]);
const PLATFORM_OPTIONS = new Set(["env", "dependency", "session-replay"]);

/**
 * Provider-neutral Bindle workload requirements (not resolver control).
 */
export interface BindleRequirements {
	readonly require: readonly string[];
	readonly prefer: readonly string[];
	readonly runtimes: readonly string[];
	readonly labels: Readonly<Record<string, string>>;
}

export type BindleRequirementsHash = `sha256:${string}`;

export function emptyBindleRequirements(): BindleRequirements {
	return Object.freeze({
		require: Object.freeze([] as string[]),
		prefer: Object.freeze([] as string[]),
		runtimes: Object.freeze([] as string[]),
		labels: Object.freeze({}),
	});
}

export function parseBindleRequirements(
	input: unknown,
): BindleRequirements {
	if (input === undefined || input === null) {
		return emptyBindleRequirements();
	}
	if (typeof input !== "object" || Array.isArray(input)) {
		throw new TypeError("bindle requirements must be an object");
	}
	const raw = input as Record<string, unknown>;
	// Reject provider-selection keys on requirements.
	for (const key of Object.keys(raw)) {
		assertProviderNeutralKey(key, "bindle.requirements");
	}
	const labels = canonicalizeLabels(
		(raw.labels as Record<string, string> | undefined) ?? {},
	);
	for (const key of Object.keys(labels)) {
		assertProviderNeutralKey(key, "bindle.requirements.labels");
	}
	const require = canonicalizeList(asStringArray(raw.require ?? raw.requires));
	const prefer = canonicalizeList(asStringArray(raw.prefer ?? raw.prefers));
	const runtimes = canonicalizeList(
		asStringArray(raw.runtimes ?? raw.runtime),
	);
	for (const item of [...require, ...prefer, ...runtimes]) {
		assertProviderNeutralCapability(item);
	}
	return Object.freeze({
		require,
		prefer,
		runtimes,
		labels,
	});
}

export function hashBindleRequirements(
	requirements: BindleRequirements,
): BindleRequirementsHash {
	const canonical = JSON.stringify({
		labels: requirements.labels,
		prefer: requirements.prefer,
		require: requirements.require,
		runtimes: requirements.runtimes,
	});
	return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

/**
 * Reject Bindle annotations that select a cloud provider or provider resolver.
 * Platform annotations (`env`, `dependency` with provider `hobo`) are allowed.
 */
export function assertNoBindleProviderSelection(
	definition: BindleDefinition,
): void {
	for (const record of Object.values(definition.resources)) {
		for (const annotation of record.annotations) {
			assertAnnotationAllowed(annotation, record.name);
		}
	}
	// Top-level forbidden fields if present via any casted payloads
	const anyDef = definition as unknown as Record<string, unknown>;
	if (anyDef.provider !== undefined || anyDef.providerId !== undefined) {
		throw bindleProviderForbidden("bindle.provider");
	}
	if (anyDef.resolution !== undefined) {
		throw bindleProviderForbidden("bindle.resolution");
	}
}

/**
 * @deprecated Use assertNoBindleProviderSelection. Provider pins on Bindles
 * are forbidden; this always returns [] after asserting none exist, or throws.
 */
export function collectExplicitProviderPins(
	definition: BindleDefinition,
): readonly string[] {
	assertNoBindleProviderSelection(definition);
	return Object.freeze([]);
}

export function isPlatformAnnotation(
	annotation: ProviderAnnotation,
): boolean {
	if (PLATFORM_OPTIONS.has(annotation.option)) {
		return PLATFORM_PROVIDERS.has(annotation.provider);
	}
	return false;
}

function assertAnnotationAllowed(
	annotation: ProviderAnnotation,
	resourceName: string,
): void {
	if (isPlatformAnnotation(annotation)) {
		// Still reject cloud provider class names in config keys.
		for (const key of Object.keys(annotation.config ?? {})) {
			if (
				/^(provider|providerId|resolverId|subscriptionId|accountId|projectId|resourceGroup)$/i.test(
					key,
				)
			) {
				throw bindleProviderForbidden(
					`resource ${resourceName} annotation config.${key}`,
				);
			}
		}
		return;
	}
	// Any non-platform annotation with a cloud provider is forbidden.
	throw bindleProviderForbidden(
		`resource ${resourceName} .with({ provider: "${annotation.provider}", option: "${annotation.option}" })`,
	);
}

function assertProviderNeutralKey(key: string, path: string): void {
	if (
		/^(provider|providerId|resolverId|subscriptionId|accountId|projectId|resourceGroup|azure|aws|gcp|cloudflare)$/i.test(
			key,
		) ||
		/^(azure|aws|gcp|cloudflare)\./i.test(key)
	) {
		throw bindleProviderForbidden(`${path}.${key}`);
	}
}

function assertProviderNeutralCapability(value: string): void {
	// Capability strings are provider-neutral requirements (e.g. managed-http-runtime).
	// Reject explicit provider.* resolver pins.
	if (/^(azure|aws|gcp|cloudflare)\./i.test(value)) {
		throw bindleProviderForbidden(`capability ${value}`);
	}
	if (/resolverId|providerId/i.test(value)) {
		throw bindleProviderForbidden(`capability ${value}`);
	}
}

function bindleProviderForbidden(path: string): Error {
	return Object.assign(
		new Error(
			`[${BINDLE_PROVIDER_SELECTION_FORBIDDEN}] ${path}: ${BINDLE_PROVIDER_SELECTION_REMEDIATION}`,
		),
		{
			code: BINDLE_PROVIDER_SELECTION_FORBIDDEN,
			remediation: BINDLE_PROVIDER_SELECTION_REMEDIATION,
			path,
		},
	);
}

function asStringArray(value: unknown): string[] {
	if (value === undefined) return [];
	if (typeof value === "string") return [value];
	if (!Array.isArray(value)) {
		throw new TypeError("expected string array");
	}
	return value.map((v) => {
		if (typeof v !== "string") throw new TypeError("expected string array");
		return v;
	});
}

function canonicalizeList(values: readonly string[]): readonly string[] {
	return Object.freeze(
		[...new Set(values.filter((v) => v.length > 0))].sort(),
	);
}

function canonicalizeLabels(
	labels: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
	const keys = Object.keys(labels).sort();
	const out: Record<string, string> = {};
	for (const key of keys) {
		const value = labels[key];
		if (typeof value !== "string") {
			throw new TypeError(`label ${key} must be a string`);
		}
		out[key] = value;
	}
	return Object.freeze(out);
}
