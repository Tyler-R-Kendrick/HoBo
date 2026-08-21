/**
 * Dogfooded Station SDK declarations for hobo-code dev scenarios (ADR-0155).
 *
 * hobo-code previously auto-inited its Station from ad-hoc arguments; the
 * shape of the durable state it created lived nowhere reviewable. These
 * declarations author the same stations with `station()` from @hobo/stations
 * — the SDK idiom the platform tells everyone else to use — so the isolation
 * class, trust domain, and expected localhost capabilities of every dev
 * scenario are declared in code and diffable in review.
 */
import {
	type Station,
	type StationCapability,
	station,
	stationCapability,
} from "@hobo/stations";

// public-contract: dev scenarios hobo-code declares stations for.
export const CODE_DEV_SCENARIOS = [
	"local-dev",
	"ephemeral",
	"preview",
] as const;
export type CodeDevScenario = (typeof CODE_DEV_SCENARIOS)[number];

/**
 * Default localhost capability set (ADR-0155): what `hobo-code init`
 * discovery matches the running machine against. Required rows gate explicit
 * init; optional rows degrade with remediation. Provenance "default" marks
 * facilities hobo-code itself supplies (present unless observed absent).
 */
export const DEFAULT_LOCALHOST_CAPABILITIES: readonly StationCapability[] = [
	stationCapability({
		kind: "runtime",
		slug: "node",
		title: "Node.js host runtime",
		required: true,
		remediation: "install Node.js 20+ (https://nodejs.org)",
	}),
	stationCapability({
		kind: "vcs",
		slug: "git",
		title: "git (worktree isolation + promotion)",
		required: true,
		remediation: "install git",
	}),
	stationCapability({
		kind: "isolation-backend",
		slug: "worktree",
		title: "classical git worktree isolation (ADR-0139)",
		required: true,
		remediation: "install git — worktree is the mandatory fallback backend",
	}),
	stationCapability({
		kind: "isolation-backend",
		slug: "rift",
		title: "rift CoW isolation (btrfs/XFS reflink or APFS clonefile)",
		remediation: "worktree fallback stays active on non-CoW filesystems",
	}),
	stationCapability({
		kind: "model-server",
		slug: "ollama",
		title: "local model server ($0 path)",
		remediation: "ollama serve · hobo-code models",
	}),
	stationCapability({
		kind: "toolchain",
		slug: "devenv",
		title: "hermetic devenv/nix shell",
		remediation: "nix profile install nixpkgs#devenv",
	}),
	stationCapability({
		kind: "harness",
		slug: "coding-agent",
		title: "registered coding harness",
		remediation: "hobo-code agents init",
	}),
	stationCapability({
		kind: "sidecar",
		slug: "dashboard",
		title: "Station sidecars (dashboard / Evidence / evals)",
		provenance: "default",
	}),
	stationCapability({
		kind: "sidecar",
		slug: "status",
		title: "Station status page (ADR-0077, default-on)",
		provenance: "default",
	}),
	stationCapability({
		kind: "replay",
		slug: "session-replay",
		title: "Session Replay (ADR-0137, privacy-first)",
		provenance: "default",
	}),
];

const SCENARIO_STATION_NAME = {
	// "local" keeps the historical station:local id every existing path binds.
	"local-dev": "local",
	ephemeral: "code-ephemeral",
	preview: "code-preview",
};

export function isCodeDevScenario(value: string): value is CodeDevScenario {
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	return (CODE_DEV_SCENARIOS as readonly string[]).includes(value);
}

/**
 * Declare the Station for a dev scenario. Same defaults `bindCodeStation`
 * always produced (tenant "local", residency "local", `<name>.hobo.local`),
 * now carried by a reviewable declaration instead of scattered call sites.
 */
export function codeDevStation(
	scenario: CodeDevScenario,
	options: {
		readonly name?: string;
		readonly tenant?: string;
	} = {},
): Station {
	const name = options.name ?? SCENARIO_STATION_NAME[scenario];
	return station(name, {
		isolation: {
			tenant: options.tenant ?? "local",
			residency: "local",
			trustDomain: `${name}.hobo.local`,
			isolationClass: scenario,
		},
		capabilities: DEFAULT_LOCALHOST_CAPABILITIES,
		metadata: {
			surface: "hobo-code",
			scenario,
		},
	});
}

/** initStation() arguments derived from a declaration — the only bridge. */
export function stationInitArgsFromDeclaration(declaration: Station) {
	return {
		id: declaration.id,
		name: declaration.name,
		tenant: declaration.isolation.tenant,
		residency: declaration.isolation.residency,
		airgap: declaration.isolation.airgap,
		trustDomain: declaration.isolation.trustDomain,
	};
}
