/**
 * Parse-don't-validate boundary for an authored guest placement.
 *
 * `browserWasm.with.guest({...})` hands this package a
 * `Record<string, unknown>`. It crosses this parser once and comes out as
 * {@link GuestPlacement}, whose fields are already bounded, page-aligned and
 * paired with the right resource class. Nothing downstream re-checks a guest
 * id or wonders whether a memory limit was mebibytes or pages.
 */
import { BrowserWasmProviderError } from "./errors.js";
import {
	GUEST_PORTS,
	type GuestPort,
	MAX_MEMORY_LIMIT_BYTES,
	MIN_MEMORY_LIMIT_BYTES,
	type PersistenceMode,
	RESOURCE_CLASS_FOR_PORT,
	WASM_PAGE_BYTES,
} from "./manifest.js";

const DNS_1123_LABEL = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/u;
const WIT_ID =
	/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)?(@[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?)?$/u;

/**
 * A guest that never yields freezes the tab: there is no OS underneath to kill
 * it and no supervisor to restart it. The epoch deadline is the whole defence,
 * so an unbounded one is the same as none.
 */
export const MAX_EPOCH_DEADLINE_MS = 300_000;
export const DEFAULT_EPOCH_DEADLINE_MS = 5_000;
export const DEFAULT_MEMORY_LIMIT_BYTES = 256 * 1024 * 1024;
// public-contract: default WIT world for browser-hosted guests.
export const DEFAULT_WORLD = "hobo:guest/http-handler@0.1.0";

/** A placement never asks for `unavailable`; that is an outcome, not a request. */
export type RequestedPersistence = Extract<
	PersistenceMode,
	"opfs-sahpool" | "transient-memory"
>;

export type GuestPlacement = {
	readonly guestId: string;
	readonly port: GuestPort;
	readonly resourceClass: string;
	readonly world: string;
	readonly persistence: RequestedPersistence;
	readonly memoryLimitBytes: number;
	readonly sharedMemory: boolean;
	readonly epochDeadlineMs: number;
	readonly requiredImports: readonly string[];
};

function rejected(message: string, detail?: Record<string, string | number>) {
	return new BrowserWasmProviderError("PLACEMENT_REJECTED", message, {
		...(detail !== undefined ? { detail } : {}),
	});
}

export function parseGuestPlacement(input: unknown): GuestPlacement {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		throw rejected("a placement must be an object");
	}
	const record = input as Record<string, unknown>;

	const guestId = record.guestId;
	if (typeof guestId !== "string" || !DNS_1123_LABEL.test(guestId)) {
		// The guest id becomes a DNS label in the station URL, so it is bounded
		// by DNS rules rather than by what a filesystem would tolerate.
		throw rejected("guestId is not an RFC 1123 label", {
			value:
				typeof guestId === "string" ? guestId.slice(0, 64) : typeof guestId,
		});
	}

	const port = record.port === undefined ? "compute" : record.port;
	if (
		typeof port !== "string" ||
		!(GUEST_PORTS as readonly string[]).includes(port)
	) {
		throw rejected(`port must be one of ${GUEST_PORTS.join(", ")}`);
	}

	const world = record.world === undefined ? DEFAULT_WORLD : record.world;
	if (typeof world !== "string" || !WIT_ID.test(world)) {
		throw rejected("world is not a WIT world id");
	}

	const persistence =
		record.persistence === undefined ? "transient-memory" : record.persistence;
	if (persistence !== "opfs-sahpool" && persistence !== "transient-memory") {
		throw rejected(
			"persistence must be opfs-sahpool or transient-memory; unavailable is an outcome, not a request",
		);
	}

	const memoryLimitBytes =
		record.memoryLimitBytes === undefined
			? DEFAULT_MEMORY_LIMIT_BYTES
			: record.memoryLimitBytes;
	if (
		typeof memoryLimitBytes !== "number" ||
		!Number.isInteger(memoryLimitBytes) ||
		memoryLimitBytes < MIN_MEMORY_LIMIT_BYTES ||
		memoryLimitBytes > MAX_MEMORY_LIMIT_BYTES
	) {
		throw rejected(
			`memoryLimitBytes must be a whole number in ${MIN_MEMORY_LIMIT_BYTES}..${MAX_MEMORY_LIMIT_BYTES}`,
		);
	}
	if (memoryLimitBytes % WASM_PAGE_BYTES !== 0) {
		throw rejected(
			`memoryLimitBytes must be a whole number of ${WASM_PAGE_BYTES} byte WebAssembly pages`,
			{ memoryLimitBytes },
		);
	}

	const sharedMemory =
		record.sharedMemory === undefined ? false : record.sharedMemory;
	if (typeof sharedMemory !== "boolean") {
		throw rejected("sharedMemory must be a boolean");
	}

	const epochDeadlineMs =
		record.epochDeadlineMs === undefined
			? DEFAULT_EPOCH_DEADLINE_MS
			: record.epochDeadlineMs;
	if (
		typeof epochDeadlineMs !== "number" ||
		!Number.isInteger(epochDeadlineMs) ||
		epochDeadlineMs < 1 ||
		epochDeadlineMs > MAX_EPOCH_DEADLINE_MS
	) {
		throw rejected(
			`epochDeadlineMs must be a whole number in 1..${MAX_EPOCH_DEADLINE_MS}`,
		);
	}

	const rawImports = record.requiredImports;
	const requiredImports =
		rawImports === undefined
			? []
			: Array.isArray(rawImports)
				? rawImports.map((entry) => {
						if (typeof entry !== "string" || !WIT_ID.test(entry)) {
							throw rejected("requiredImports holds a non-WIT interface id");
						}
						return entry;
					})
				: (() => {
						throw rejected("requiredImports must be a list");
					})();

	return Object.freeze({
		guestId,
		port: port as GuestPort,
		resourceClass: RESOURCE_CLASS_FOR_PORT[port as GuestPort],
		world,
		persistence,
		memoryLimitBytes,
		sharedMemory,
		epochDeadlineMs,
		requiredImports: Object.freeze(requiredImports),
	});
}

export function guestManifestPath(guestId: string): string {
	return `/_hobo/guests/${guestId}/manifest.json`;
}

// public-contract: host capability discovery endpoint.
export const HOST_CAPABILITIES_PATH = "/_hobo/host/capabilities";
