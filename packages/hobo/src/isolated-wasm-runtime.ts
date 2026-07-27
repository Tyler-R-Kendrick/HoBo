import { createServer, type Server } from "node:http";

import { loadBindleDefinition } from "@hobo/cli";
import type {
	HttpRequest,
	HttpResponse,
	ParsedComponentDescriptor,
} from "@hobo/core";
import {
	createInProcessWasmtimeEngine,
	createRuntimeLocalComponentHost,
	HTTP_INCOMING_HANDLER,
} from "@hobo/runtime-local";

import {
	type BareMetalServeResult,
	type ComponentEndpoint,
	type FetchHandler,
	collectBindleEnvInjections,
	installInternalMesh,
	INTERNAL_MESH_HOST,
	internalMeshBase,
	listServableEntrypoints,
	serviceDiscoveryKey,
} from "./bare-metal-host.js";
import {
	type BareMetalYard,
	composeBareMetalTopology,
	DEFAULT_DEV_PORT,
	openBareMetalYard,
} from "./bare-metal-yard.js";
import {
	bootWasmtimeSandbox,
	ensureIsolatedWasmToolchain,
	preparePrivateWasmComponent,
	type WasmtimeSandbox,
} from "./wasm-sandbox.js";

// **Isolated-wasm Camp component host** — real Wasmtime OS-process sandboxes.
//
// Feature parity with componentHost=local:
//   - external-only public TCP, private mesh URLs, services__* + bindle env
//   - component host lifecycle for the external surface
//
// Real isolation (what local does NOT provide):
//   - each *private* component is componentized to a wasi:http/proxy .wasm
//   - each runs in its own `wasmtime serve` OS process
//   - WASI caps restricted (no FS grants, no guest network, loopback only)
//   - mesh RPCs cross the process boundary to 127.0.0.1 sandbox ports

export type IsolatedWasmServeResult = BareMetalServeResult & {
	readonly componentHost: "isolated-wasm";
	readonly isolation: {
		readonly privateSandboxes: number;
		/** @deprecated use privateSandboxes */
		readonly privateWorkers: number;
		readonly meshHost: typeof INTERNAL_MESH_HOST;
		readonly isolateBoundary: "wasmtime_process";
		readonly wasmtimeVersion: string;
		readonly wasmPaths: readonly string[];
	};
};

async function webRequestToHttp(request: Request): Promise<HttpRequest> {
	const url = new URL(request.url);
	const body =
		request.method === "GET" || request.method === "HEAD"
			? ""
			: await request.text();
	return {
		method: request.method,
		path: `${url.pathname}${url.search}`,
		headers: [...request.headers.entries()] as [string, string][],
		body,
	};
}

function httpResponseToWeb(response: HttpResponse): Response {
	return new Response(response.body, {
		status: response.status,
		headers: Object.fromEntries(response.headers),
	});
}

function componentDescriptor(
	id: string,
	handler: FetchHandler,
): ParsedComponentDescriptor {
	return {
		parsed: true,
		id,
		imports: [],
		exports: {
			[HTTP_INCOMING_HANDLER]: {
				handle: async (httpReq: unknown): Promise<HttpResponse> => {
					const req = httpReq as HttpRequest;
					const webReq = new Request(`http://component.local${req.path}`, {
						method: req.method,
						headers: Object.fromEntries(req.headers),
						...(req.body && req.method !== "GET" && req.method !== "HEAD"
							? { body: req.body }
							: {}),
					});
					const webRes = await handler(webReq);
					return {
						status: webRes.status,
						headers: [...webRes.headers.entries()] as [string, string][],
						body: await webRes.text(),
					};
				},
			},
		},
	};
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
					const url = new URL(req.url ?? "/", `http://${host}:${port}`);
					const body = Buffer.concat(chunks);
					const method = req.method ?? "GET";
					const init: RequestInit = {
						method,
						headers: req.headers as HeadersInit,
					};
					if (!["GET", "HEAD"].includes(method) && body.length > 0) {
						init.body = body;
					}
					const response = await handler(new Request(url, init));
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
 * Place a Bindle into a Camp on the local Yard using the isolated-wasm
 * component host (real Wasmtime OS-process sandboxes for private components).
 */
export async function serveProjectOnIsolatedWasm(options: {
	readonly projectDir: string;
	readonly yard?: BareMetalYard;
	readonly port?: number;
	readonly hoboHome?: string;
	readonly emitProgress?: (message: string) => void;
}): Promise<IsolatedWasmServeResult> {
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
	const basePort =
		options.port ?? yardHandle.config.defaultPort ?? DEFAULT_DEV_PORT;

	const toolchain = await ensureIsolatedWasmToolchain({
		...(options.hoboHome !== undefined ? { hoboHome: options.hoboHome } : {}),
		emitProgress: emit,
	});
	emit(
		`hobo dev: local Yard '${yardHandle.config.name}' Camp component host=isolated-wasm (wasmtime ${toolchain.wasmtime.version} process sandboxes)`,
	);

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
		throw new Error("local topology produced no camps");
	}
	emit(
		`hobo dev: Camp ${campObject.id} hosts bindle ${definition.name} (provider ${topology.providerId})`,
	);

	const entrypoints = listServableEntrypoints(definition);
	const externalEntries = entrypoints.filter((e) => e.external);
	const privateEntries = entrypoints.filter((e) => !e.external);
	if (externalEntries.length === 0) {
		ownedYard?.close();
		throw new Error(
			`bindle ${definition.name} has no external endpoint to expose`,
		);
	}

	const bindleEnv = collectBindleEnvInjections(definition);
	for (const [key, value] of Object.entries(bindleEnv)) {
		process.env[key] = value;
	}

	// Boot private components in real Wasmtime OS-process sandboxes.
	// Guests are app-supplied adapters (not frameworks baked into @hobo/*).
	// Bindle env is injected by the Camp mesh on each hop.
	const sandboxes: WasmtimeSandbox[] = [];
	const privateHandlers = new Map<string, FetchHandler>();
	try {
		for (const entry of privateEntries) {
			const component = await preparePrivateWasmComponent({
				projectDir: options.projectDir,
				resourceName: entry.name,
				jcoBin: toolchain.jco.binPath,
				...(options.hoboHome !== undefined
					? { hoboHome: options.hoboHome }
					: {}),
				emitProgress: emit,
			});
			const sandbox = await bootWasmtimeSandbox({
				resourceName: entry.name,
				wasmPath: component.wasmPath,
				wasmtimeBin: toolchain.wasmtime.binPath,
				emitProgress: emit,
			});
			sandboxes.push(sandbox);
			privateHandlers.set(entry.name, sandbox.invoke);
		}
	} catch (error) {
		await Promise.all(sandboxes.map((s) => s.terminate()));
		ownedYard?.close();
		throw error;
	}
	const uninstallMesh = installInternalMesh(privateHandlers, { bindleEnv });

	const endpoints: ComponentEndpoint[] = [];
	const serviceDiscovery: Record<string, string> = {};

	for (const entry of privateEntries) {
		const url = internalMeshBase(entry.name);
		const key = serviceDiscoveryKey(entry.name);
		endpoints.push({
			resourceName: entry.name,
			kind: entry.kind,
			url,
			port: null,
			external: false,
			serviceDiscoveryKey: key,
		});
		serviceDiscovery[key] = url;
		process.env[key] = url;
		const sandbox = sandboxes.find((s) => s.resourceName === entry.name);
		emit(
			`hobo dev: private ${entry.kind}:${entry.name} → ${url} (wasmtime pid=${sandbox?.pid ?? "?"} loopback=${sandbox?.loopbackUrl ?? "?"}, no public TCP)`,
		);
	}

	// External web on main: still goes through component host for lifecycle parity.
	const host = createRuntimeLocalComponentHost({
		engine: createInProcessWasmtimeEngine(),
		appendEvent: () => {},
	});
	const servers: Server[] = [];
	let publicIndex = 0;
	for (const entry of externalEntries) {
		host.loadComponent(componentDescriptor(entry.name, entry.handler));
		const port = basePort + publicIndex;
		publicIndex += 1;
		const url = `http://127.0.0.1:${port}`;
		const key = serviceDiscoveryKey(entry.name);
		endpoints.push({
			resourceName: entry.name,
			kind: entry.kind,
			url,
			port,
			external: true,
			serviceDiscoveryKey: key,
		});
		serviceDiscovery[key] = url;
		process.env[key] = url;
		const publicHandler: FetchHandler = async (request) => {
			const httpReq = await webRequestToHttp(request);
			const httpRes = await host.handleHttp(entry.name, httpReq);
			return httpResponseToWeb(httpRes);
		};
		servers.push(await listen(publicHandler, port));
		emit(`hobo dev: exposed ${entry.kind}:${entry.name} at ${url}`);
	}

	emit(
		`hobo dev: injected discovery [${Object.keys(serviceDiscovery).join(", ")}] ` +
			`bindle-env [${Object.keys(bindleEnv).join(", ")}] sandboxes=${privateEntries.length}`,
	);

	const exposedEndpoints = endpoints.filter((e) => e.external);
	const primary = exposedEndpoints[0]!;
	let probe: { status: number; body: string };
	try {
		const response = await fetch(`${primary.url}/`);
		probe = { status: response.status, body: await response.text() };
	} catch (error) {
		probe = { status: 0, body: String(error) };
	}
	emit(`hobo dev: probe ${primary.url}/ -> ${probe.status}`);

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
		uninstallMesh();
		await Promise.all(sandboxes.map((s) => s.terminate()));
		for (const entry of externalEntries) {
			try {
				await host.teardownComponent(entry.name);
			} catch {
				// already torn down
			}
		}
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
		exposedEndpoints,
		serviceDiscovery,
		bindleEnv,
		primaryUrl: primary.url,
		probe,
		close,
		waitUntilStopped,
		componentHost: "isolated-wasm",
		isolation: {
			privateSandboxes: privateEntries.length,
			privateWorkers: privateEntries.length,
			meshHost: INTERNAL_MESH_HOST,
			isolateBoundary: "wasmtime_process",
			wasmtimeVersion: toolchain.wasmtime.version,
			wasmPaths: sandboxes.map((s) => s.wasmPath),
		},
	};
}
