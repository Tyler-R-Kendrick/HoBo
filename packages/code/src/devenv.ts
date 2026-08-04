/**
 * hobo-code's own environment, declared with devenv.
 *
 * The harness shells out to git, tmux, ssh, node, python and ollama. Those
 * were previously assumed to exist; `devenv.nix` at the package root now
 * names them, and this module reports honestly whether the toolchain to
 * enter that environment is installed — nix is not present everywhere, and
 * claiming a hermetic shell you cannot enter would be theatre.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

export interface DevenvStatus {
	/** hobo-code ships devenv.nix / devenv.yaml. */
	readonly declared: boolean;
	readonly files: readonly string[];
	/** `devenv` CLI on PATH. */
	readonly devenvAvailable: boolean;
	/** `nix` on PATH — devenv needs it. */
	readonly nixAvailable: boolean;
	/** Already inside a devenv/nix shell. */
	readonly active: boolean;
	readonly platformSupported: boolean;
	readonly enterCommand: string;
	readonly notes: readonly string[];
}

export interface DevenvProbes {
	readonly which: (binary: string) => string | null;
	readonly exists: (path: string) => boolean;
	readonly env: NodeJS.ProcessEnv;
	readonly platform: NodeJS.Platform;
}

export function inspectDevenv(
	packageRoot: string,
	probes: DevenvProbes,
): DevenvStatus {
	const files = ["devenv.nix", "devenv.yaml"].filter((f) =>
		probes.exists(join(packageRoot, f)),
	);
	const devenvAvailable = probes.which("devenv") !== null;
	const nixAvailable = probes.which("nix") !== null;
	const active =
		probes.env.DEVENV_ROOT !== undefined ||
		probes.env.IN_NIX_SHELL !== undefined;
	// Nix covers Linux and macOS; Windows goes through WSL2.
	const platformSupported =
		probes.platform === "linux" || probes.platform === "darwin";

	const notes: string[] = [];
	if (files.length === 0) notes.push("no devenv config found in this package");
	if (!platformSupported) {
		notes.push(
			`nix does not run natively on ${probes.platform} — use WSL2, or run hobo-code without the hermetic shell`,
		);
	}
	if (!nixAvailable) {
		notes.push(
			"nix is not installed — https://nixos.org/download (devenv needs it)",
		);
	}
	if (nixAvailable && !devenvAvailable) {
		notes.push(
			"nix present but devenv is not — nix profile install nixpkgs#devenv",
		);
	}
	if (active) notes.push("already inside a devenv/nix shell");
	if (files.length > 0 && devenvAvailable && !active) {
		notes.push("run `devenv shell` for the declared toolchain");
	}

	return {
		declared: files.length > 0,
		files,
		devenvAvailable,
		nixAvailable,
		active,
		platformSupported,
		enterCommand: "devenv shell",
		notes,
	};
}

export function devenvSummary(status: DevenvStatus): string {
	const state = status.active
		? "active"
		: status.devenvAvailable
			? "available"
			: status.nixAvailable
				? "nix only"
				: "not installed";
	return [
		`devenv · ${state}${status.declared ? ` · ${status.files.join(" + ")}` : " · undeclared"}`,
		...status.notes.map((n) => `  · ${n}`),
	].join("\n");
}

/** Default probes over the real PATH and filesystem. */
export function defaultDevenvProbes(
	env: NodeJS.ProcessEnv = process.env,
): DevenvProbes {
	const paths = (env.PATH ?? "").split(":").filter((p) => p.length > 0);
	return {
		which: (binary) => {
			for (const dir of paths) {
				const candidate = join(dir, binary);
				if (existsSync(candidate)) return candidate;
			}
			return null;
		},
		exists: (path) => existsSync(path),
		env,
		platform: process.platform,
	};
}
