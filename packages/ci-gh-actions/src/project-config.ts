import { toJsonString } from "@bufbuild/protobuf";
import {
	DesiredCiPolicySchema,
	type ParsedCiPolicy,
	parseCiPolicy,
} from "@hobo/ci";
import { z } from "zod";
import { createCiRelayClient } from "./client.js";

const environmentName = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const ExplicitEnvironment = z.string().regex(environmentName);
const validatedConfigs = new WeakSet<CiProjectConfig>();
const ProjectInput = z
	.object({
		defaultEnvironment: z.string().regex(environmentName).optional(),
		environments: z
			.record(
				z.string().regex(environmentName),
				z
					.object({
						relayOrigin: z.string().min(1).max(2048),
						githubWebhookOrigin: z.string().min(1).max(2048).optional(),
						allowInsecureLoopback: z.boolean().optional(),
						policy: z.unknown(),
					})
					.strict(),
			)
			.optional(),
	})
	.strict();

export interface CiProjectEnvironment {
	readonly name: string;
	readonly relayOrigin: string;
	/** Declared public GitHub ingress; reachability and registration are separate. */
	readonly githubWebhookOrigin: string | undefined;
	readonly allowInsecureLoopback: boolean;
	readonly policy: ParsedCiPolicy;
}

export interface CiProjectConfig {
	readonly defaultEnvironment: string;
	readonly environments: Readonly<Record<string, CiProjectEnvironment>>;
}

export interface CiProjectConfigInput {
	defaultEnvironment?: string;
	environments?: Record<
		string,
		{
			relayOrigin: string;
			githubWebhookOrigin?: string;
			allowInsecureLoopback?: boolean;
			policy: Parameters<typeof import("@hobo/ci").defineCiPolicy>[0];
		}
	>;
}

function projectConfig(
	defaultEnvironment: string,
	environments: Readonly<Record<string, CiProjectEnvironment>>,
): CiProjectConfig {
	const entries = Object.values(environments);
	if (
		entries.length === 0 ||
		entries.length > 32 ||
		!Object.hasOwn(environments, defaultEnvironment)
	)
		throw new Error("invalid environment selection");
	const targets = new Set<string>();
	for (const entry of entries) {
		const key = JSON.stringify([entry.relayOrigin, entry.policy.accountId]);
		if (targets.has(key)) throw new Error("duplicate environment account");
		targets.add(key);
	}
	const config = Object.freeze({
		defaultEnvironment,
		environments: Object.freeze({ ...environments }),
	});
	validatedConfigs.add(config);
	return config;
}

function relayOrigin(value: string, allowInsecureLoopback: boolean): string {
	const url = new URL(value);
	const loopback =
		allowInsecureLoopback &&
		url.protocol === "http:" &&
		(url.hostname === "localhost" || url.hostname === "127.0.0.1");
	if (
		(!loopback && url.protocol !== "https:") ||
		url.username ||
		url.password ||
		url.pathname !== "/" ||
		url.search ||
		url.hash
	)
		throw new Error("invalid relay origin");
	return url.origin;
}

/** Refuse destinations GitHub cannot reach as literals; DNS is not verified. */
function githubWebhookOrigin(value: string): string {
	const normalized = relayOrigin(value, false);
	const host = new URL(normalized).hostname.toLowerCase().replace(/\.$/, "");
	if (host === "localhost" || host.endsWith(".localhost"))
		throw new Error("unreachable GitHub webhook origin");
	const parts = host.split(".");
	if (parts.length === 4 && parts.every((part) => /^\d+$/.test(part))) {
		const [a, b] = parts.map(Number);
		if (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 100 && b !== undefined && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b !== undefined && b >= 16 && b <= 31) ||
			(a === 192 && b === 168)
		)
			throw new Error("unreachable GitHub webhook origin");
	}
	if (host.startsWith("[") && host.endsWith("]")) {
		const address = host.slice(1, -1);
		const first = Number.parseInt(address.split(":")[0] ?? "0", 16);
		if (
			address.startsWith("::") ||
			(first & 0xfe00) === 0xfc00 ||
			(first & 0xffc0) === 0xfe80 ||
			(first & 0xff00) === 0xff00
		)
			throw new Error("unreachable GitHub webhook origin");
	}
	return normalized;
}

/** Parse repository-local data. It never reads secrets or changes a relay. */
export function parseCiProjectConfig(
	json: string,
	organization?: CiProjectConfig,
): CiProjectConfig {
	try {
		if (
			json.length > 256 * 1024 ||
			new TextEncoder().encode(json).byteLength > 256 * 1024
		)
			throw new Error("project configuration too large");
		if (organization && !validatedConfigs.has(organization))
			throw new Error("organization configuration is not validated");
		const input = ProjectInput.parse(JSON.parse(json));
		const entries = Object.entries(input.environments ?? {});
		const environments = Object.fromEntries(
			entries.map(([name, entry]) => {
				const allowInsecureLoopback = entry.allowInsecureLoopback ?? false;
				return [
					name,
					Object.freeze({
						name,
						relayOrigin: relayOrigin(entry.relayOrigin, allowInsecureLoopback),
						githubWebhookOrigin: entry.githubWebhookOrigin
							? githubWebhookOrigin(entry.githubWebhookOrigin)
							: undefined,
						allowInsecureLoopback,
						policy: parseCiPolicy(JSON.stringify(entry.policy)),
					}),
				];
			}),
		);
		const defaultEnvironment =
			input.defaultEnvironment ?? organization?.defaultEnvironment;
		if (!defaultEnvironment) throw new Error("default environment required");
		return projectConfig(defaultEnvironment, {
			...organization?.environments,
			...environments,
		});
	} catch {
		// Repository input can contain arbitrary text. Never put it in an error.
		throw new Error("invalid CI project configuration");
	}
}

/** Author the same repository configuration from the SDK. */
export function defineCiProjectConfig(
	input: CiProjectConfigInput,
	organization?: CiProjectConfig,
): CiProjectConfig {
	try {
		// `defineCiPolicy` returns frozen protobuf messages whose `$typeName`
		// metadata is not part of the authored JSON schema. All other fields
		// still pass through the strict policy parser below.
		return parseCiProjectConfig(
			JSON.stringify(input, (key, value) =>
				key === "$typeName" ? undefined : value,
			),
			organization,
		);
	} catch {
		throw new Error("invalid CI project configuration");
	}
}

/** Select a named profile; process environment is never consulted implicitly. */
export function selectCiEnvironment(
	config: CiProjectConfig,
	environment?: string,
): CiProjectEnvironment {
	if (!validatedConfigs.has(config))
		throw new Error("CI project configuration has not been validated");
	const name = environment ?? config.defaultEnvironment;
	if (!environmentName.test(name) || !Object.hasOwn(config.environments, name))
		throw new Error("unknown CI environment");
	const selected = config.environments[name];
	if (!selected) throw new Error("unknown CI environment");
	return selected;
}

export interface CiEnvironmentCredentialScope {
	readonly environment: string;
	readonly origin: string;
	readonly accountId: string;
}

export interface ConfiguredCiRelayOptions {
	/** Trusted environment, canonical origin and account bindings from outside the repo. */
	trustedTargets: readonly CiEnvironmentCredentialScope[];
	accountToken: (
		scope: CiEnvironmentCredentialScope,
	) => string | Promise<string>;
	fetch?: typeof fetch;
}

export interface CiPolicyApplyOptions extends ConfiguredCiRelayOptions {
	/** Digest from a trusted source independent of repository-controlled files. */
	expectedPolicySha256: string;
}

/** Hash normalized protobuf JSON for review and out-of-band policy pinning. */
export async function ciEnvironmentPolicySha256(
	config: CiProjectConfig,
	environment: string,
): Promise<string> {
	if (!ExplicitEnvironment.safeParse(environment).success)
		throw new Error("explicit CI environment required");
	const selected = selectCiEnvironment(config, environment);
	const bytes = new TextEncoder().encode(
		toJsonString(DesiredCiPolicySchema, selected.policy),
	);
	const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

/** Pin the endpoint before looking up or transmitting an account credential. */
export function createConfiguredCiRelayClient(
	config: CiProjectConfig,
	environment: string,
	options: ConfiguredCiRelayOptions,
) {
	if (!ExplicitEnvironment.safeParse(environment).success)
		throw new Error("explicit CI environment required");
	const selected = selectCiEnvironment(config, environment);
	const scope = Object.freeze({
		environment: selected.name,
		origin: selected.relayOrigin,
		accountId: selected.policy.accountId,
	});
	if (
		!options.trustedTargets.some(
			(target) =>
				target.environment === scope.environment &&
				target.origin === scope.origin &&
				target.accountId === scope.accountId,
		)
	)
		throw new Error("CI relay environment binding is not trusted");
	return createCiRelayClient({
		origin: selected.relayOrigin,
		allowInsecureLoopback: selected.allowInsecureLoopback,
		accountToken: () => options.accountToken(scope),
		fetch: options.fetch ?? fetch,
	});
}

/** Apply only on an explicit call, after verifying account identity and revision. */
export async function applyCiEnvironmentPolicy(
	config: CiProjectConfig,
	environment: string,
	options: CiPolicyApplyOptions,
) {
	const selected = selectCiEnvironment(config, environment);
	if (
		!/^[a-f0-9]{64}$/.test(options.expectedPolicySha256) ||
		(await ciEnvironmentPolicySha256(config, environment)) !==
			options.expectedPolicySha256
	)
		throw new Error("CI policy does not match trusted digest");
	const client = createConfiguredCiRelayClient(config, environment, options);
	const current = await client.getPolicy();
	if (current.account?.id !== selected.policy.accountId)
		throw new Error("CI relay account does not match selected policy");
	// The parsed policy is a frozen protobuf message. The client accepts authored
	// protobuf JSON, so remove message metadata through the protobuf serializer.
	const policy = JSON.parse(
		toJsonString(DesiredCiPolicySchema, selected.policy),
	);
	return client.putDesiredPolicy(policy, { revision: current.revision });
}
