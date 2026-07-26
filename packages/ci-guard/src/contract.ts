export const CI_FABRIC_SCHEMA = "hobo.ciFabric/v1" as const;

const REQUIRED_PR_CHECKS = [
	"build",
	"typecheck",
	"lint",
	"unit",
	"conformance",
] as const;

export type RequiredPrCheck = (typeof REQUIRED_PR_CHECKS)[number];

export interface ArtifactCacheEntry {
	readonly kind: "wasm" | "oci";
	readonly path: string;
	readonly keyFrom?: readonly string[];
}

// domain-view: readonly parse target narrowed to the RequiredPrCheck union; data-models/ci_fabric.proto PullRequestGate is its wire form.
export interface PullRequestGate {
	readonly blocksPullRequest: boolean;
	readonly requiredChecks: readonly RequiredPrCheck[];
}

export interface WorkflowContract {
	readonly name: string;
	readonly path: string;
	readonly triggers: {
		readonly pullRequest: boolean;
		readonly schedule: string;
		readonly workflowDispatch: boolean;
		readonly mergeGroup?: boolean;
	};
	readonly pullRequestGate: PullRequestGate;
	readonly artifactCache: {
		readonly entries: readonly ArtifactCacheEntry[];
	};
}

export interface E2eCostGate {
	readonly kind: "pull-request-label" | "schedule" | "manual";
	readonly label?: string;
	readonly cron?: string;
}

// domain-view: readonly parse target with required nested selector; data-models/ci_fabric.proto CloudRole is its wire form.
export interface CloudRole {
	readonly name: string;
	readonly allowedActions: readonly string[];
	readonly resourceSelector: {
		readonly fixture: string;
		readonly runLabel: string;
	};
}

export interface E2eAuth {
	readonly mode: "oidc-federation";
	readonly audience: string;
	readonly tokenBroker: string;
	readonly forbidsStoredSecrets: boolean;
	readonly allowedTrustDomain: string;
	readonly cloudRole: CloudRole;
}

export interface E2eTeardown {
	readonly command: string;
	readonly always: boolean;
	readonly orphanSweeper: {
		readonly enabled: boolean;
		readonly maxAgeMinutes: number;
		readonly selector: string;
	};
}

export interface E2eQuarantine {
	readonly label: string;
	readonly lane: string;
	readonly continueOnError: boolean;
	readonly blocksPullRequest: boolean;
}

export interface E2eContract {
	readonly name: string;
	readonly fixture: string;
	readonly permissions: {
		readonly contents: "read";
		readonly "id-token": "write";
	};
	readonly env: Readonly<Record<string, string>>;
	readonly gatedBy: readonly E2eCostGate[];
	readonly auth: E2eAuth;
	readonly deploy: {
		readonly command: string;
		readonly asserts: readonly string[];
	};
	readonly teardown: E2eTeardown;
	readonly quarantine: E2eQuarantine;
}

// domain-view: readonly parse-produced aggregate pinned to the literal CI_FABRIC_SCHEMA; data-models/ci_fabric.proto CiFabricContract is its wire form.
export interface CiFabricContract {
	readonly schema: typeof CI_FABRIC_SCHEMA;
	readonly workflow: WorkflowContract;
	readonly e2e: E2eContract;
}

export class CiFabricContractError extends Error {
	readonly code: string;
	readonly details: Record<string, unknown>;

	constructor(
		code: string,
		message: string,
		details: Record<string, unknown> = {},
	) {
		super(message);
		this.name = "CiFabricContractError";
		this.code = code;
		this.details = details;
	}
}

export function createHoboCiFabricContract(
	overrides: DeepPartial<CiFabricContract> = {},
): CiFabricContract {
	const base: CiFabricContract = {
		schema: CI_FABRIC_SCHEMA,
		workflow: {
			name: "hobo-ci",
			path: ".github/workflows/hobo-ci.yml",
			triggers: {
				pullRequest: true,
				schedule: "17 3 * * 1",
				workflowDispatch: true,
				mergeGroup: true,
			},
			pullRequestGate: {
				blocksPullRequest: true,
				requiredChecks: [...REQUIRED_PR_CHECKS],
			},
			artifactCache: {
				entries: [
					{
						kind: "wasm",
						path: "~/.cache/hobo/wasm",
						keyFrom: [
							"pnpm-lock.yaml",
							"packages/**/package.json",
							"wit/**/*.wit",
						],
					},
					{
						kind: "oci",
						path: "~/.cache/hobo/oci",
						keyFrom: [
							"pnpm-lock.yaml",
							"packages/**/package.json",
							"packages/**/src/**",
						],
					},
				],
			},
		},
		e2e: {
			name: "hello-bindle-e2e",
			fixture: "examples/hello-bindle",
			permissions: {
				contents: "read",
				"id-token": "write",
			},
			env: {},
			gatedBy: [
				{ kind: "pull-request-label", label: "hobo/e2e" },
				{ kind: "schedule", cron: "17 3 * * 1" },
				{ kind: "manual" },
			],
			auth: {
				mode: "oidc-federation",
				audience: "hobo:sandbox-cloud",
				tokenBroker: "https://sandbox.yard.example/.well-known/hobo/oidc/token",
				forbidsStoredSecrets: true,
				allowedTrustDomain:
					"spiffe://sandbox.yard/ci/github/tyler-r-kendrick/hobo",
				cloudRole: {
					name: "hobo-ci-hello-bindle-e2e",
					allowedActions: [
						"deployments:create",
						"deployments:read",
						"deployments:delete",
					],
					resourceSelector: {
						fixture: "hello-bindle",
						runLabel: "hobo.dev/github-run-id",
					},
				},
			},
			deploy: {
				command: "simulate up examples/hello-bindle --camp sandbox-ci",
				asserts: [
					"live-url.https",
					"live-url.http-2xx",
					"fixture.hello-bindle",
				],
			},
			teardown: {
				command: "simulate down examples/hello-bindle --camp sandbox-ci",
				always: true,
				orphanSweeper: {
					enabled: true,
					maxAgeMinutes: 60,
					selector: "hobo.dev/fixture=hello-bindle",
				},
			},
			quarantine: {
				label: "hobo/e2e-quarantine",
				lane: "hello-bindle-fixture-quarantine",
				continueOnError: true,
				blocksPullRequest: false,
			},
		},
	};

	return deepFreeze(deepMerge(base, overrides)) as CiFabricContract;
}

type DeepPartial<T> = T extends object
	? { readonly [K in keyof T]?: DeepPartial<T[K]> }
	: T;

function deepMerge<T extends object>(base: T, overrides: DeepPartial<T>): T {
	if (Array.isArray(base) || Array.isArray(overrides)) {
		return (overrides === undefined ? clone(base) : clone(overrides)) as T;
	}
	if (!isPlainObject(base) || !isPlainObject(overrides)) {
		return (overrides === undefined ? clone(base) : clone(overrides)) as T;
	}

	const merged = { ...base } as Record<string, unknown>;
	for (const key of new Set([
		...Object.keys(base),
		...Object.keys(overrides),
	])) {
		const baseValue = (base as Record<string, unknown>)[key];
		const overrideValue = (overrides as Record<string, unknown>)[key];
		merged[key] =
			isPlainObject(baseValue) && isPlainObject(overrideValue)
				? deepMerge(baseValue, overrideValue)
				: overrideValue === undefined
					? clone(baseValue)
					: clone(overrideValue);
	}
	return merged as T;
}

function clone<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((item) => clone(item)) as T;
	}
	if (isPlainObject(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, child]) => [key, clone(child)]),
		) as T;
	}
	return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return (
		value !== null &&
		typeof value === "object" &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

function deepFreeze<T>(value: T): T {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) {
			deepFreeze(child);
		}
		Object.freeze(value);
	}
	return value;
}

export { REQUIRED_PR_CHECKS };
