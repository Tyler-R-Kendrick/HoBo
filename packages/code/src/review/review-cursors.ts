import { createHmac, timingSafeEqual } from "node:crypto";

import { reviewError } from "./review-errors.js";

export type ReviewCursorKind = "manifest" | "chunk";

export interface ReviewCursor {
	readonly kind: ReviewCursorKind;
	readonly generationId: string;
	readonly offset: number;
	readonly fileId?: string;
}

interface PackedCursor {
	readonly k: "m" | "c";
	readonly g: string;
	readonly o: number;
	readonly f?: string;
}

function base64Url(bytes: Uint8Array): string {
	return Buffer.from(bytes)
		.toString("base64")
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/u, "");
}

function fromBase64Url(value: string): Buffer {
	const padded = value.replaceAll("-", "+").replaceAll("_", "/");
	const pad =
		padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
	return Buffer.from(`${padded}${pad}`, "base64");
}

function pack(cursor: ReviewCursor): PackedCursor {
	return {
		k: cursor.kind === "manifest" ? "m" : "c",
		g: cursor.generationId,
		o: cursor.offset,
		...(cursor.fileId === undefined ? {} : { f: cursor.fileId }),
	};
}

function unpack(packed: PackedCursor): ReviewCursor {
	return {
		kind: packed.k === "m" ? "manifest" : "chunk",
		generationId: packed.g,
		offset: packed.o,
		...(packed.f === undefined ? {} : { fileId: packed.f }),
	};
}

function xor(bytes: Buffer, mask: Buffer): Buffer {
	const out = Buffer.allocUnsafe(bytes.length);
	for (let index = 0; index < bytes.length; index += 1)
		out[index] = (bytes[index] ?? 0) ^ (mask[index % mask.length] ?? 0);
	return out;
}

function hmac(secret: string, bytes: Uint8Array): Buffer {
	return createHmac("sha256", secret).update(bytes).digest();
}

export function encodeReviewCursor(
	cursor: ReviewCursor,
	secret: string,
): string {
	if (!Number.isInteger(cursor.offset) || cursor.offset < 0) {
		throw reviewError(
			"malformed-input",
			"cursor offset must be a whole number",
		);
	}
	const payload = Buffer.from(JSON.stringify(pack(cursor)));
	const mac = hmac(secret, payload);
	const masked = xor(
		payload,
		hmac(secret, Buffer.from(`mask:${base64Url(mac)}`)),
	);
	return `${base64Url(masked)}.${base64Url(mac)}`;
}

export function decodeReviewCursor(
	raw: string,
	expected: {
		readonly secret: string;
		readonly generationId: string;
		readonly kind: ReviewCursorKind;
		readonly fileId?: string;
	},
): ReviewCursor {
	const dot = raw.lastIndexOf(".");
	if (dot <= 0) {
		throw reviewError("malformed-input", "cursor is not an opaque token");
	}
	let masked: Buffer;
	let mac: Buffer;
	try {
		masked = fromBase64Url(raw.slice(0, dot));
		mac = fromBase64Url(raw.slice(dot + 1));
	} catch {
		throw reviewError("malformed-input", "cursor is not an opaque token");
	}
	if (mac.length !== 32) {
		throw reviewError("corrupted-state", "cursor authentication failed");
	}
	const payload = xor(
		masked,
		hmac(expected.secret, Buffer.from(`mask:${base64Url(mac)}`)),
	);
	const expectedMac = hmac(expected.secret, payload);
	if (expectedMac.length !== mac.length || !timingSafeEqual(expectedMac, mac)) {
		throw reviewError("corrupted-state", "cursor authentication failed");
	}
	let packed: PackedCursor;
	try {
		packed = JSON.parse(payload.toString("utf8")) as PackedCursor;
	} catch {
		throw reviewError("corrupted-state", "cursor payload is not valid");
	}
	if (
		(packed.k !== "m" && packed.k !== "c") ||
		typeof packed.g !== "string" ||
		!Number.isInteger(packed.o) ||
		packed.o < 0
	) {
		throw reviewError("malformed-input", "cursor payload is malformed");
	}
	const cursor = unpack(packed);
	if (cursor.generationId !== expected.generationId) {
		throw reviewError(
			"stale-generation",
			"cursor belongs to another generation",
			{ generationId: cursor.generationId },
		);
	}
	if (cursor.kind !== expected.kind) {
		throw reviewError("malformed-input", "cursor kind does not match request");
	}
	if (expected.fileId !== undefined && cursor.fileId !== expected.fileId) {
		throw reviewError("malformed-input", "cursor file does not match request");
	}
	return cursor;
}
