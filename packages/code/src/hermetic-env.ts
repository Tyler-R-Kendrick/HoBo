/**
 * Hermetic / durable environment detection for hobo-code.
 *
 * Scoped to the coding harness (not monorepo-wide Nix IaC). Detects optional
 * devenv/direnv/Nix shells so advanced Nix developers get nix-terminal parity
 * without requiring Nix for other HoBo surfaces.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// public-contract: wire format id for hermetic env report payloads (CLI --json + evidence)
export const HERMETIC_ENV_SCHEMA = "hobo.code.hermetic-env/v1" as const;

export type HermeticMarker =
	| "devenv.nix"
	| "devenv.yaml"
	| "flake.nix"
	| "shell.nix"
	| ".envrc"
	| "direnv";

export type HermeticEnvReport = {
	readonly schema: typeof HERMETIC_ENV_SCHEMA;
	readonly projectRoot: string;
	readonly hoboHome: string;
	/** True when a hermetic shell declaration is present in the project. */
	readonly hermeticDeclared: boolean;
	/** True when the process looks like it is already inside devenv/nix/direnv. */
	readonly hermeticActive: boolean;
	readonly markers: readonly HermeticMarker[];
	readonly envHints: {
		readonly IN_NIX_SHELL: boolean;
		readonly DEVENV_ROOT: boolean;
		readonly DIRENV_DIR: boolean;
		readonly NIX_STORE: boolean;
	};
	/**
	 * Durable vs ephemeral layout (nix-store purity analog):
	 * sandboxes are ephemeral; durable learning stays under HOBO_HOME/durable.
	 */
	readonly layout: {
		readonly sandboxes: string;
		readonly durable: string;
		readonly worlds: string;
		readonly pureSeparation: true;
	};
	readonly recommendations: readonly string[];
	/** Fidelity label for devenv-managed services (never claim live cloud). */
	readonly fidelity: "hermetic-declared" | "hermetic-active" | "host-default";
};

function hasFile(root: string, name: string): boolean {
	return existsSync(join(root, name));
}

/**
 * Probe project + process for hermetic shell signals.
 * Pure detection — does not activate devenv or spawn nix.
 *
 * hobo-code also ships its own `devenv.nix` / `devenv.yaml` (see the package
 * root): the harness declares the tools it shells out to — git, tmux, ssh,
 * node/pnpm, python for the Needle bridge, ollama for local inference —
 * rather than assuming they exist. `hobo-code env` reports whether the
 * toolchain to enter that environment is actually installed.
 */
export function inspectHermeticEnv(options: {
	readonly projectRoot: string;
	readonly hoboHome: string;
	readonly env?: NodeJS.ProcessEnv;
}): HermeticEnvReport {
	const env = options.env ?? process.env;
	const root = options.projectRoot;
	const markers: HermeticMarker[] = [];

	if (hasFile(root, "devenv.nix")) markers.push("devenv.nix");
	if (hasFile(root, "devenv.yaml")) markers.push("devenv.yaml");
	if (hasFile(root, "flake.nix")) markers.push("flake.nix");
	if (hasFile(root, "shell.nix")) markers.push("shell.nix");
	if (hasFile(root, ".envrc")) {
		markers.push(".envrc");
		// direnv often pairs with .envrc
		try {
			const envrc = readFileSync(join(root, ".envrc"), "utf8");
			if (/\bdirenv\b|use flake|use devenv|use nix/i.test(envrc)) {
				markers.push("direnv");
			}
		} catch {
			// ignore unreadable .envrc
		}
	}

	const envHints = {
		IN_NIX_SHELL: Boolean(env.IN_NIX_SHELL),
		DEVENV_ROOT: Boolean(env.DEVENV_ROOT && String(env.DEVENV_ROOT).length > 0),
		DIRENV_DIR: Boolean(env.DIRENV_DIR && String(env.DIRENV_DIR).length > 0),
		NIX_STORE: Boolean(env.NIX_STORE && String(env.NIX_STORE).length > 0),
	};

	const hermeticDeclared = markers.length > 0;
	const hermeticActive =
		envHints.IN_NIX_SHELL || envHints.DEVENV_ROOT || envHints.DIRENV_DIR;

	const recommendations: string[] = [];
	if (hermeticDeclared && !hermeticActive) {
		recommendations.push(
			"Hermetic shell files present — enter with `devenv shell`, `direnv allow`, or `nix develop` before long hobo-code sessions.",
		);
	}
	if (!hermeticDeclared) {
		recommendations.push(
			"Optional: add devenv.nix (or flake.nix) for hermetic toolchains. Nix is never required for hobo-code.",
		);
	}
	if (hermeticActive && !env.HOBO_HOME) {
		recommendations.push(
			"Set HOBO_HOME to a writable durable path outside the Nix store (e.g. $PWD/.hobo-home or $XDG_STATE_HOME/hobo).",
		);
	}
	recommendations.push(
		"Isolation: sandboxes are ephemeral; durable learning stays under $HOBO_HOME/durable/code/ — never write durable state into the sandbox root.",
	);

	const fidelity: HermeticEnvReport["fidelity"] = hermeticActive
		? "hermetic-active"
		: hermeticDeclared
			? "hermetic-declared"
			: "host-default";

	return {
		schema: HERMETIC_ENV_SCHEMA,
		projectRoot: root,
		hoboHome: options.hoboHome,
		hermeticDeclared,
		hermeticActive,
		markers: [...new Set(markers)],
		envHints,
		layout: {
			sandboxes: join(options.hoboHome, "sandboxes"),
			durable: join(options.hoboHome, "durable", "code"),
			worlds: join(options.hoboHome, "worlds"),
			pureSeparation: true,
		},
		recommendations,
		fidelity,
	};
}

/** One-line human chrome for dense panels. */
export function hermeticEnvSummary(report: HermeticEnvReport): string {
	if (report.hermeticActive) {
		const m = report.markers.slice(0, 2).join("+") || "nix";
		return `hermetic·on·${m}`;
	}
	if (report.hermeticDeclared) {
		return `hermetic·declared·${report.markers[0] ?? "shell"}`;
	}
	return "hermetic·host";
}
