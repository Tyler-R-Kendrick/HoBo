import { createServer, type Server } from "node:http";

import type { BindleDefinition } from "@hobo/bindles";
import { loadBindleDefinition } from "@hobo/cli";
import type { Yard } from "@hobo/yards";

import {
	type BareMetalYard,
	composeBareMetalTopology,
	DEFAULT_DEV_PORT,
	openBareMetalYard,
} from "./bare-metal-yard.js";

// Camp host for the bare-metal Yard: loads the project's bindle, builds a real
// Camp/Yard topology, injects Aspire-compatible service endpoints
// (services__<resource>__http__0), and serves each api/web entrypoint over HTTP.
// This is the path `hobo dev` uses — not a side-script over raw Hono.

export type FetchHandler = (
	input: Request,
) => Response | Promise<Response>;

export interface ComponentEndpoint {
	readonly resourceName: string;
	readonly kind: string;
	readonly url: string;
	readonly port: number;
	readonly serviceDiscoveryKey: string;
}

export interface BareMetalServeResult {
	readonly projectDir: string;
	readonly bindleName: string;
	readonly yard: Yard;
	readonly campId: string;
	readonly endpoints: readonly ComponentEndpoint[];
	readonly serviceDiscovery: Readonly<Record<string, string>>;
	/** Env keys injected from bindle `.with({ option: "env", config })` annotations. */
	readonly bindleEnv: Readonly<Record<string, string>>;
	readonly primaryUrl: string;
	readonly probe: { readonly status: number; readonly body: string };
	readonly close: () => Promise<void>;
	/** Block until the host is stopped (SIGINT/SIGTERM or close()). */
	readonly waitUntilStopped: () => Promise<void>;
}

export function serviceDiscoveryKey(
	resourceName: string,
	endpointName = "http",
	index = 0,
): string {
	return `services__${resourceName}__${endpointName}__${index}`;
}

function isHttpComponent(kind: string): boolean {
	return kind === "api" || kind === "web" || kind === "service";
}

function asFetchHandler(value: unknown): FetchHandler | null {
	if (typeof value === "function") {
		return value as FetchHandler;
	}
	return null;
}

/**
 * Collect process env the camp must inject from bindle resource annotations.
 * Convention: `.with({ provider, option: "env", config: { KEY: "value" } })`.
 */
export function collectBindleEnvInjections(
	definition: BindleDefinition,
): Record<string, string> {
	const env: Record<string, string> = {};
	for (const record of Object.values(definition.resources)) {
		for (const annotation of record.annotations) {
			if (annotation.option !== "env") continue;
			for (const [key, value] of Object.entries(annotation.config)) {
				if (
					typeof value === "string" ||
					typeof value === "number" ||
					typeof value === "boolean"
				) {
					env[key] = String(value);
				}
			}
		}
	}
	return env;
}

/**
 * Collect api/web/service entrypoints from a loaded BindleDefinition.
 * Order: web first (external surface), then api, then other services.
 */
export function listServableEntrypoints(definition: BindleDefinition): Array<{
	readonly name: string;
	readonly kind: string;
	readonly handler: FetchHandler;
}> {
	const entries: Array<{
		name: string;
		kind: string;
		handler: FetchHandler;
	}> = [];
	for (const [name, record] of Object.entries(definition.resources)) {
		if (!isHttpComponent(record.kind)) continue;
		const thunk = definition.entrypoint(name);
		if (typeof thunk !== "function") continue;
		const resolved = asFetchHandler(thunk());
		if (resolved === null) continue;
		entries.push({ name, kind: record.kind, handler: resolved });
	}
	const rank = (kind: string) =>
		kind === "web" ? 0 : kind === "api" ? 1 : 2;
	return entries.sort((a, b) => rank(a.kind) - rank(b.kind));
}

async function listen(
	handler: FetchHandler,
	port: number,
	host = "127.0.0.1",
): Promise<Server> {
	const server = createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => {
			chunks.push(chunk);
		});
		req.on("end", () => {
			void (async () => {
				try {
					const url = new URL(
						req.url ?? "/",
						`http://${host}:${port}`,
					);
					const body = Buffer.concat(chunks);
					const method = req.method ?? "GET";
					const init: RequestInit = {
						method,
						headers: req.headers as HeadersInit,
					};
					if (!["GET", "HEAD"].includes(method) && body.length > 0) {
						init.body = body;
					}
					const request = new Request(url, init);
					const response = await handler(request);
					res.writeHead(
						response.status,
						Object.fromEntries(response.headers.entries()),
					);
					res.end(Buffer.from(await response.arrayBuffer()));
				} catch (error) {
					res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
					res.end(String(error));
				}
			})();
		});
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, host, () => resolve());
	});
	return server;
}

/**
 * Serve a project's bindle on the bare-metal Yard:
 * load bindle → compose Camp/Yard → allocate ports → inject services__* → listen.
 */
export async function serveProjectOnBareMetalYard(options: {
	readonly projectDir: string;
	readonly yard?: BareMetalYard;
	readonly port?: number;
	readonly hoboHome?: string;
	readonly emitProgress?: (message: string) => void;
}): Promise<BareMetalServeResult> {
	const emit = options.emitProgress ?? (() => {});
	const ownedYard =
		options.yard === undefined
			? openBareMetalYard({
					...(options.hoboHome !== undefined
						? { hoboHome: options.hoboHome }
						: {}),
				})
			: null;
	const yardHandle = options.yard ?? ownedYard!;
	const basePort = options.port ?? yardHandle.config.defaultPort ?? DEFAULT_DEV_PORT;

	emit(`hobo dev: opening bare-metal yard '${yardHandle.config.name}'`);
	const definition = await loadBindleDefinition(options.projectDir);
	if (definition === null) {
		ownedYard?.close();
		throw new Error(
			`no loadable bindle in ${options.projectDir} (need src/bindle.ts or dist/bindle.js)`,
		);
	}

	const topology = composeBareMetalTopology(definition, {
		yardName: yardHandle.config.name,
		campEnv: "dev",
		dataDir: yardHandle.config.dataDir,
	});
	const campObject = topology.camps[0];
	if (campObject === undefined) {
		ownedYard?.close();
		throw new Error("bare-metal topology produced no camps");
	}
	emit(
		`hobo dev: camp ${campObject.id} routes bindle ${definition.name} on provider ${topology.providerId}`,
	);

	const entrypoints = listServableEntrypoints(definition);
	if (entrypoints.length === 0) {
		ownedYard?.close();
		throw new Error(
			`bindle ${definition.name} has no api/web entrypoints to serve`,
		);
	}

	// Allocate one loopback port per HTTP component (Aspire multi-endpoint model).
	const endpoints: ComponentEndpoint[] = entrypoints.map((entry, index) => {
		const port = basePort + index;
		const url = `http://127.0.0.1:${port}`;
		return {
			resourceName: entry.name,
			kind: entry.kind,
			url,
			port,
			serviceDiscoveryKey: serviceDiscoveryKey(entry.name),
		};
	});

	// Camp injects Aspire-compatible service discovery *and* bindle-declared
	// env config into the process before any entrypoint handles traffic.
	const serviceDiscovery: Record<string, string> = {};
	for (const endpoint of endpoints) {
		serviceDiscovery[endpoint.serviceDiscoveryKey] = endpoint.url;
		process.env[endpoint.serviceDiscoveryKey] = endpoint.url;
	}
	const bindleEnv = collectBindleEnvInjections(definition);
	for (const [key, value] of Object.entries(bindleEnv)) {
		process.env[key] = value;
	}
	emit(
		`hobo dev: injected discovery [${Object.keys(serviceDiscovery).join(", ")}] ` +
			`bindle-env [${Object.keys(bindleEnv).join(", ")}]`,
	);

	const servers: Server[] = [];
	for (let i = 0; i < entrypoints.length; i += 1) {
		const entry = entrypoints[i]!;
		const endpoint = endpoints[i]!;
		const server = await listen(entry.handler, endpoint.port);
		servers.push(server);
		emit(
			`hobo dev: serving ${entry.kind}:${entry.name} at ${endpoint.url}`,
		);
	}

	const primary = endpoints[0]!;
	let probe: { status: number; body: string };
	try {
		const response = await fetch(`${primary.url}/`);
		probe = { status: response.status, body: await response.text() };
	} catch (error) {
		probe = { status: 0, body: String(error) };
	}
	emit(
		`hobo dev: probe ${primary.url}/ -> ${probe.status}`,
	);

	let stopped: (() => void) | undefined;
	const waitUntilStopped = () =>
		new Promise<void>((resolve) => {
			stopped = resolve;
			const onSignal = () => {
				void close().then(resolve);
			};
			process.once("SIGINT", onSignal);
			process.once("SIGTERM", onSignal);
		});

	const close = async () => {
		await Promise.all(
			servers.map(
				(server) =>
					new Promise<void>((resolve, reject) => {
						server.close((error) => (error ? reject(error) : resolve()));
					}),
			),
		);
		for (const key of Object.keys(serviceDiscovery)) {
			if (process.env[key] === serviceDiscovery[key]) {
				delete process.env[key];
			}
		}
		for (const [key, value] of Object.entries(bindleEnv)) {
			if (process.env[key] === value) {
				delete process.env[key];
			}
		}
		ownedYard?.close();
		stopped?.();
	};

	return {
		projectDir: options.projectDir,
		bindleName: definition.name,
		yard: topology,
		campId: campObject.id,
		endpoints,
		serviceDiscovery,
		bindleEnv,
		primaryUrl: primary.url,
		probe,
		close,
		waitUntilStopped,
	};
}
