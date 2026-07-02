export const TOPOLOGY_CONTRACT_VERSION = "hobo.topology-objects/v1" as const;

export interface ProviderSelection {
	readonly kind: "provider-selection";
	readonly providerId: string;
	readonly selector: string;
	readonly options: Readonly<Record<string, unknown>>;
}

export interface Camp {
	readonly kind: "camp";
	readonly contract: typeof TOPOLOGY_CONTRACT_VERSION;
	readonly id: string;
	readonly name: string;
	readonly env: string;
	readonly envType: string;
	readonly providerId: string;
	readonly runtime: unknown;
	readonly bindle: import("@hobo/bindles/topology").BindleScope;
	readonly mappings: {
		readonly defaultProvider: ProviderSelection | null;
		readonly tiers: Readonly<Record<string, ProviderSelection>>;
		readonly bindings: Readonly<Record<string, ProviderSelection>>;
	};
	readonly resolutionOrder: readonly ["bindings", "tiers", "defaultProvider"];
	readonly resolutionPrecedence: readonly ResolutionPrecedenceRecord[];
}

export interface ResolutionPrecedenceRecord {
	readonly resource: string;
	readonly resourceName: string;
	readonly resourceKind: string;
	readonly portRef: string;
	readonly order: readonly ResolutionStep[];
}

export interface ResolutionStep {
	readonly source: "bindings" | "tiers" | "defaultProvider";
	readonly key: string;
	readonly providerId: string | null;
	readonly selector: string | null;
}

export interface CampConfig {
	readonly bindle: import("@hobo/bindles/topology").BindleScope;
	readonly runtime: unknown;
	readonly envType?: string;
	readonly defaultProvider?: ProviderSelection;
	readonly tiers?: Readonly<Record<string, ProviderSelection>>;
	readonly bindings?: Readonly<Record<string, ProviderSelection>>;
}
