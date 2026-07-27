/**
 * @deprecated Legacy worker_thread isolate entry.
 * isolated-wasm now uses real Wasmtime OS-process sandboxes (see wasm-sandbox.ts).
 * Kept for reference / emergency fallback experiments only.
 */
import { parentPort, workerData } from "node:worker_threads";

import { loadBindleDefinition } from "@hobo/cli";

import { isExternalComponent, type FetchHandler } from "./bare-metal-host.js";

interface BootData {
	readonly projectDir: string;
	readonly resourceName: string;
	readonly bindleEnv: Record<string, string>;
}

interface HttpMessage {
	readonly type: "http";
	readonly id: string;
	readonly method: string;
	readonly path: string;
	readonly headers: [string, string][];
	readonly body: string;
}

const data = workerData as BootData;

for (const [key, value] of Object.entries(data.bindleEnv)) {
	process.env[key] = value;
}

let handler: FetchHandler | null = null;

async function boot(): Promise<void> {
	const definition = await loadBindleDefinition(data.projectDir);
	if (definition === null) {
		throw new Error(`worker: no bindle in ${data.projectDir}`);
	}
	const record = definition.resources[data.resourceName];
	if (record === undefined) {
		throw new Error(`worker: unknown resource ${data.resourceName}`);
	}
	// Isolated workers host private components; refuse external ones.
	if (isExternalComponent(record.kind, record.annotations)) {
		throw new Error(
			`worker: refuse to isolate external resource ${data.resourceName}`,
		);
	}
	const thunk = definition.entrypoint(data.resourceName);
	if (typeof thunk !== "function") {
		throw new Error(`worker: no entrypoint for ${data.resourceName}`);
	}
	const resolved = thunk();
	if (typeof resolved !== "function") {
		throw new Error(
			`worker: entrypoint for ${data.resourceName} is not a fetch handler`,
		);
	}
	handler = resolved as FetchHandler;
	parentPort?.postMessage({ type: "ready", resourceName: data.resourceName });
}

parentPort?.on("message", (message: HttpMessage | { type: "shutdown" }) => {
	void (async () => {
		if (message.type === "shutdown") {
			process.exit(0);
		}
		if (message.type !== "http" || handler === null) {
			return;
		}
		try {
			const request = new Request(`http://component.local${message.path}`, {
				method: message.method,
				headers: Object.fromEntries(message.headers),
				...(message.body &&
				message.method !== "GET" &&
				message.method !== "HEAD"
					? { body: message.body }
					: {}),
			});
			const response = await handler(request);
			const body = await response.text();
			parentPort?.postMessage({
				type: "http-response",
				id: message.id,
				status: response.status,
				headers: [...response.headers.entries()],
				body,
			});
		} catch (error) {
			parentPort?.postMessage({
				type: "http-response",
				id: message.id,
				status: 500,
				headers: [["content-type", "text/plain; charset=utf-8"]],
				body: error instanceof Error ? error.message : String(error),
			});
		}
	})();
});

boot().catch((error) => {
	parentPort?.postMessage({
		type: "error",
		message: error instanceof Error ? error.message : String(error),
	});
	process.exit(1);
});
