import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { BindleDefinition } from "@hobo/bindles";
import { bindleScope, descriptorFromHandle } from "@hobo/bindles/topology";
import { camp, providerSelection } from "@hobo/camps";
import type { YardRuntime } from "@hobo/cli";
import { type Yard, yard } from "@hobo/yards";

import { createDefaultYardRuntime } from "./compose.js";
import {
	createBareMetalProvider,
	BARE_METAL_PROVIDER_ID,
} from "./local-provider.js";

// Bare-metal Yard: the default local control scope that runs on the operator's
// own machine. `hobo yard init` writes the config; `hobo dev` opens it and
// creates Camps from each project's bindle so entrypoints are served with
// Aspire-compatible service-discovery injection (services__*).

export const BARE_METAL_YARD_SCHEMA = "hobo.yard/v1" as const;
export const BARE_METAL_YARD_KIND = "bare-metal" as const;
export const DEFAULT_BARE_METAL_YARD_NAME = "local";
export const DEFAULT_DEV_PORT = 4000;

export interface BareMetalYardConfig {
	readonly schemaVersion: typeof BARE_METAL_YARD_SCHEMA;
	readonly kind: typeof BARE_METAL_YARD_KIND;
	readonly name: string;
	readonly dataDir: string;
	readonly providerId: typeof BARE_METAL_PROVIDER_ID;
	readonly defaultPort: number;
}

export interface BareMetalYard {
	readonly config: BareMetalYardConfig;
	readonly runtime: YardRuntime;
	readonly close: () => void;
}

export function defaultHoboHome(env: NodeJS.ProcessEnv = process.env): string {
	const fromEnv = env.HOBO_HOME;
	if (typeof fromEnv === "string" && fromEnv.length > 0) {
		return fromEnv;
	}
	return join(homedir(), ".hobo");
}

export function yardConfigPath(hoboHome: string): string {
	return join(hoboHome, "yard.json");
}

export function defaultYardDataDir(hoboHome: string, name: string): string {
	return join(hoboHome, "yards", name);
}

export function parseBareMetalYardConfig(input: unknown): BareMetalYardConfig {
	if (input === null || typeof input !== "object" || Array.isArray(input)) {
		throw new TypeError("yard config must be an object");
	}
	const raw = input as Record<string, unknown>;
	if (raw.schemaVersion !== BARE_METAL_YARD_SCHEMA) {
		throw new TypeError(
			`yard config schemaVersion must be ${BARE_METAL_YARD_SCHEMA}`,
		);
	}
	if (raw.kind !== BARE_METAL_YARD_KIND) {
		throw new TypeError(`yard config kind must be ${BARE_METAL_YARD_KIND}`);
	}
	if (typeof raw.name !== "string" || raw.name.length === 0) {
		throw new TypeError("yard config name must be a non-empty string");
	}
	if (typeof raw.dataDir !== "string" || raw.dataDir.length === 0) {
		throw new TypeError("yard config dataDir must be a non-empty string");
	}
	if (raw.providerId !== BARE_METAL_PROVIDER_ID) {
		throw new TypeError(
			`yard config providerId must be ${BARE_METAL_PROVIDER_ID}`,
		);
	}
	const defaultPort =
		typeof raw.defaultPort === "number" && Number.isInteger(raw.defaultPort)
			? raw.defaultPort
			: DEFAULT_DEV_PORT;
	return {
		schemaVersion: BARE_METAL_YARD_SCHEMA,
		kind: BARE_METAL_YARD_KIND,
		name: raw.name,
		dataDir: raw.dataDir,
		providerId: BARE_METAL_PROVIDER_ID,
		defaultPort,
	};
}

export function scaffoldBareMetalYardConfig(
	options: {
		readonly hoboHome?: string;
		readonly name?: string;
		readonly dataDir?: string;
		readonly defaultPort?: number;
	} = {},
): BareMetalYardConfig {
	const hoboHome = options.hoboHome ?? defaultHoboHome();
	const name = options.name ?? DEFAULT_BARE_METAL_YARD_NAME;
	return {
		schemaVersion: BARE_METAL_YARD_SCHEMA,
		kind: BARE_METAL_YARD_KIND,
		name,
		dataDir: options.dataDir ?? defaultYardDataDir(hoboHome, name),
		providerId: BARE_METAL_PROVIDER_ID,
		defaultPort: options.defaultPort ?? DEFAULT_DEV_PORT,
	};
}

export function initBareMetalYard(
	options: {
		readonly hoboHome?: string;
		readonly name?: string;
		readonly dataDir?: string;
		readonly defaultPort?: number;
		readonly force?: boolean;
	} = {},
): { readonly config: BareMetalYardConfig; readonly configPath: string } {
	const hoboHome = options.hoboHome ?? defaultHoboHome();
	const configPath = yardConfigPath(hoboHome);
	if (existsSync(configPath) && options.force !== true) {
		throw new Error(
			`bare-metal yard already configured at ${configPath} (pass --force to overwrite)`,
		);
	}
	const config = scaffoldBareMetalYardConfig({
		hoboHome,
		...(options.name !== undefined ? { name: options.name } : {}),
		...(options.dataDir !== undefined ? { dataDir: options.dataDir } : {}),
		...(options.defaultPort !== undefined
			? { defaultPort: options.defaultPort }
			: {}),
	});
	mkdirSync(hoboHome, { recursive: true });
	mkdirSync(config.dataDir, { recursive: true });
	writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`, "utf8");
	return { config, configPath };
}

export function loadBareMetalYardConfig(
	hoboHome: string = defaultHoboHome(),
): BareMetalYardConfig | null {
	const configPath = yardConfigPath(hoboHome);
	if (!existsSync(configPath)) {
		return null;
	}
	const raw = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
	return parseBareMetalYardConfig(raw);
}

/**
 * Open the installed bare-metal yard (or init a default one when missing).
 * Uses the composition root's YardRuntime with a durable dataDir so plan/up
 * facts and the local camp host share one control scope.
 */
export function openBareMetalYard(
	options: {
		readonly hoboHome?: string;
		readonly autoInit?: boolean;
	} = {},
): BareMetalYard {
	const hoboHome = options.hoboHome ?? defaultHoboHome();
	let config = loadBareMetalYardConfig(hoboHome);
	if (config === null) {
		if (options.autoInit === false) {
			throw new Error(
				`no bare-metal yard at ${yardConfigPath(hoboHome)}; run \`hobo yard init\``,
			);
		}
		config = initBareMetalYard({ hoboHome }).config;
	}
	mkdirSync(config.dataDir, { recursive: true });
	const runtime = createDefaultYardRuntime({ dataDir: config.dataDir });
	return {
		config,
		runtime,
		close: () => {
			const store = runtime.store as { close?: () => void };
			store.close?.();
		},
	};
}

/**
 * Compose a real Yard topology object for a project's BindleDefinition:
 * one Camp on the bare-metal provider, with every bindle resource mapped in.
 */
export function composeBareMetalTopology(
	definition: BindleDefinition,
	options: {
		readonly yardName?: string;
		readonly campEnv?: string;
		readonly dataDir: string;
	},
): Yard {
	const scope = bindleScope(definition.name, (collector) => {
		for (const resource of Object.values(definition.resources)) {
			const port =
				resource.kind === "api" ||
				resource.kind === "web" ||
				resource.kind === "service"
					? "wasi:http"
					: resource.kind === "kv"
						? "hobo:key-value"
						: resource.kind === "bucket"
							? "hobo:object-store"
							: "hobo:data";
			collector.use(
				descriptorFromHandle({
					kind: resource.kind,
					name: resource.name,
					port,
				}),
			);
		}
	});

	const homeCamp = camp(options.campEnv ?? "dev", {
		bindle: scope,
		runtime: {
			kind: "runtime-local",
			eventStore: "sqlite",
			dataDir: options.dataDir,
			provider: BARE_METAL_PROVIDER_ID,
		},
		envType: "development",
		defaultProvider: providerSelection(BARE_METAL_PROVIDER_ID),
	});

	return yard(options.yardName ?? "bare-metal", {
		camps: [homeCamp],
	});
}

/** Ensure the bare-metal provider is available for topology authoring. */
export function bareMetalProvider() {
	return createBareMetalProvider();
}
