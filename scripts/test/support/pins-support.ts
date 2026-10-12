/**
 * Shared fixtures for the sibling-pin tests: a loopback HTTP server that
 * counts requests and serves an in-memory file table.
 *
 * Nothing here touches the network beyond 127.0.0.1.
 */
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../..",
);

export function scratch(label: string): string {
	return mkdtempSync(join(tmpdir(), `pins-${label}-`));
}

export function sha256Hex(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export interface FileServer {
	readonly origin: string;
	/** `METHOD path` of every request, in order. */
	readonly hits: string[];
	setFile(path: string, bytes: Uint8Array | string): void;
	setRedirect(path: string, location: string): void;
	close(): Promise<void>;
}

/** Loopback HTTP server over an in-memory file table. */
export async function startServer(): Promise<FileServer> {
	const files = new Map<string, Uint8Array>();
	const redirects = new Map<string, string>();
	const hits: string[] = [];
	const server = createServer(
		(request: IncomingMessage, response: ServerResponse) => {
			const path = request.url ?? "/";
			hits.push(`${request.method ?? "GET"} ${path}`);
			const location = redirects.get(path);
			if (location !== undefined) {
				response.writeHead(302, { location });
				response.end();
				return;
			}
			const bytes = files.get(path);
			if (bytes === undefined) {
				response.writeHead(404);
				response.end("not found");
				return;
			}
			response.writeHead(200, { "content-length": String(bytes.byteLength) });
			response.end(bytes);
		},
	);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	// SAFETY: listen(0, host) binds a TCP socket, so address() is an AddressInfo.
	const { port } = server.address() as AddressInfo;
	return {
		origin: `http://127.0.0.1:${port}`,
		hits,
		setFile(path, bytes) {
			files.set(path, bytes instanceof Uint8Array ? bytes : Buffer.from(bytes));
		},
		setRedirect(path, location) {
			redirects.set(path, location);
		},
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.close((error) =>
					error === undefined ? resolve() : reject(error),
				);
			}),
	};
}
