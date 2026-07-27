import type { BrowserPersistenceMode } from "./types.js";

/**
 * Detect browser storage capabilities without assuming OPFS is present.
 * Checked 2026-07-27 against SQLite WASM OPFS guidance:
 * https://sqlite.org/wasm/doc/trunk/persistence.md
 */
export function detectBrowserPersistence(options: {
	allowTransient?: boolean;
	multiTab?: boolean;
}): {
	mode: BrowserPersistenceMode;
	reason?: string;
} {
	const hasWorker =
		typeof Worker !== "undefined" || typeof globalThis.Worker !== "undefined";
	if (!hasWorker && typeof process === "undefined") {
		// Node test harness may not define Worker; treat as transient when allowed
	}

	const opfs =
		typeof navigator !== "undefined" &&
		navigator.storage &&
		typeof (navigator.storage as { getDirectory?: unknown }).getDirectory ===
			"function";

	if (opfs) {
		return {
			mode: options.multiTab ? "opfs-sahpool" : "opfs-sahpool",
		};
	}

	if (options.allowTransient) {
		return {
			mode: "transient-memory",
			reason: "OPFS unavailable; transient in-memory mode allowed by policy",
		};
	}

	return {
		mode: "unavailable",
		reason: "OPFS unavailable and durable persistence required",
	};
}
