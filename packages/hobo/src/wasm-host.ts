/**
 * Local Yard serve dispatch (glossary-aligned).
 *
 * Yard = control plane (`hobo yard init`).
 * Camp = placement target created when serving a Bindle.
 * Component host = Camp capability that executes components:
 *   - local: process-local mesh + Wasmtime-shaped component host
 *   - isolated-wasm: real Wasmtime OS-process sandboxes for private components
 */
import {
	createInProcessWasmtimeEngine,
	createWasmtimeCliEngine,
} from "@hobo/runtime-local";

import type { BareMetalServeResult } from "./bare-metal-host.js";
import type { BareMetalYard, ComponentHostKind } from "./bare-metal-yard.js";
import { serveProjectOnIsolatedWasm } from "./isolated-wasm-runtime.js";
import { serveBindleOnLocalYard } from "./local-yard-serve.js";
import { PINNED_WASMTIME_VERSION } from "./wasm-sandbox.js";

export interface WasmHostProbe {
	readonly engineKind: "wasmtime";
	readonly engineSource: "cli" | "in-process";
	readonly engineVersion: string;
	readonly wasmtimeCliAvailable: boolean;
	readonly notes: readonly string[];
	readonly componentHosts: {
		readonly local: "process-local mesh + component host (Camp capability)";
		readonly "isolated-wasm": "wasmtime OS-process sandboxes for private components";
	};
	/** @deprecated use componentHosts */
	readonly tiers: WasmHostProbe["componentHosts"];
}

export function probeWasmHostInstall(
	options: { readonly binPath?: string; readonly env?: NodeJS.ProcessEnv } = {},
): WasmHostProbe {
	const env = options.env ?? process.env;
	const candidates = [
		options.binPath,
		env.HOBO_WASMTIME_BIN,
		env.HOME ? `${env.HOME}/.hobo/tools/wasmtime` : undefined,
		"wasmtime",
	].filter(
		(value): value is string => typeof value === "string" && value.length > 0,
	);

	const notes: string[] = [];
	const componentHosts = {
		local: "process-local mesh + component host (Camp capability)" as const,
		"isolated-wasm":
			"wasmtime OS-process sandboxes for private components" as const,
	};

	let lastError = "wasmtime not found";
	for (const binPath of candidates) {
		try {
			const engine = createWasmtimeCliEngine({ binPath });
			notes.push(`wasmtime CLI ok (${engine.version}) at ${binPath}`);
			notes.push(
				"Yard places Camps; component host is a Camp capability (not the Yard itself)",
			);
			notes.push(
				`isolated-wasm uses real .wasm + wasmtime serve (pinned ${PINNED_WASMTIME_VERSION})`,
			);
			return {
				engineKind: "wasmtime",
				engineSource: "cli",
				engineVersion: engine.version,
				wasmtimeCliAvailable: true,
				notes,
				componentHosts,
				tiers: componentHosts,
			};
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
	}

	notes.push(`wasmtime CLI unavailable: ${lastError}`);
	notes.push(
		`isolated-wasm will auto-download wasmtime ${PINNED_WASMTIME_VERSION} into ~/.hobo/tools on first serve`,
	);
	notes.push(
		"local component host still runs (in-process engine; no .wasm bytes)",
	);
	const engine = createInProcessWasmtimeEngine();
	return {
		engineKind: "wasmtime",
		engineSource: "in-process",
		engineVersion: engine.version,
		wasmtimeCliAvailable: false,
		notes,
		componentHosts,
		tiers: componentHosts,
	};
}

/** @deprecated use serveBindleOnLocalYard */
export async function serveProjectOnWasmHost(
	options: Parameters<typeof serveBindleOnLocalYard>[0],
): Promise<BareMetalServeResult & { readonly componentHost: string }> {
	const result = await serveBindleOnLocalYard(options);
	return { ...result, componentHost: "local" };
}

function normalizeKind(raw: string | undefined): ComponentHostKind {
	if (raw === "bare-metal" || raw === "runtime-local" || raw === undefined) {
		return "local";
	}
	if (raw === "local" || raw === "isolated-wasm") return raw;
	return "local";
}

/** Place a Bindle on the local Yard using the configured Camp component host. */
export async function serveProjectOnLocalYard(options: {
	readonly projectDir: string;
	readonly yard?: BareMetalYard;
	readonly port?: number;
	readonly hoboHome?: string;
	readonly emitProgress?: (message: string) => void;
	readonly componentHost?: ComponentHostKind | "bare-metal" | "runtime-local";
	/** @deprecated use componentHost */
	readonly host?: ComponentHostKind | "bare-metal" | "runtime-local";
}): Promise<
	BareMetalServeResult & {
		readonly componentHost: string;
		readonly isolation?: {
			readonly privateWorkers: number;
			readonly privateSandboxes?: number;
			readonly meshHost: string;
			readonly isolateBoundary: string;
			readonly wasmtimeVersion?: string;
			readonly wasmPaths?: readonly string[];
		};
	}
> {
	const owned =
		options.yard === undefined
			? (await import("./bare-metal-yard.js")).openBareMetalYard({
					...(options.hoboHome !== undefined
						? { hoboHome: options.hoboHome }
						: {}),
				})
			: null;
	const yard = options.yard ?? owned!;
	const componentHost = normalizeKind(
		options.componentHost ??
			options.host ??
			yard.config.componentHost ??
			yard.config.host,
	);

	const wrapClose = <T extends { close: () => Promise<void> }>(
		result: T,
	): T => {
		if (owned === null) return result;
		const inner = result.close.bind(result);
		return {
			...result,
			close: async () => {
				await inner();
				owned.close();
			},
		};
	};

	if (componentHost === "isolated-wasm") {
		const result = await serveProjectOnIsolatedWasm({
			...options,
			yard,
		});
		return wrapClose(result);
	}

	const result = await serveBindleOnLocalYard({
		...options,
		yard,
	});
	return wrapClose(result);
}
