/**
 * Typed RPC membrane between the UI thread and the SQLite Worker.
 * Implementation-specific SQLite handles never cross this boundary.
 */

import type {
	BrowserStorageRequest,
	BrowserStorageResponse,
} from "./types.js";

export function parseBrowserStorageRequest(
	value: unknown,
): BrowserStorageRequest {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new TypeError("storage request must be an object");
	}
	const source = value as Record<string, unknown>;
	if (typeof source.id !== "string" || source.id.length === 0) {
		throw new TypeError("storage request id is required");
	}
	if (typeof source.op !== "string") {
		throw new TypeError("storage request op is required");
	}
	return value as BrowserStorageRequest;
}

export function isBrowserStorageResponse(
	value: unknown,
): value is BrowserStorageResponse {
	if (!value || typeof value !== "object") return false;
	const source = value as Record<string, unknown>;
	return typeof source.id === "string" && typeof source.ok === "boolean";
}
