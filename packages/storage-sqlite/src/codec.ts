/**
 * Explicit payload codecs for durable boundary records.
 * No ambiguous "JSON-looking BLOB" without codec metadata.
 */

export type PayloadCodec = "json-v1" | "protobuf-v1";

export const DEFAULT_PAYLOAD_CODEC: PayloadCodec = "json-v1";
export const DEFAULT_METADATA_CODEC: PayloadCodec = "json-v1";
export const DEFAULT_STATE_CODEC: PayloadCodec = "json-v1";

export class UnsupportedCodecError extends Error {
	readonly code = "UNSUPPORTED_CODEC" as const;
	constructor(
		readonly codec: string,
		readonly field: string,
	) {
		super(`unsupported codec "${codec}" for ${field}`);
		this.name = "UnsupportedCodecError";
	}
}

export function encodeJson(value: unknown): Uint8Array {
	const text = JSON.stringify(value ?? null);
	return new TextEncoder().encode(text);
}

export function decodeJson(bytes: Uint8Array): unknown {
	const text = new TextDecoder().decode(bytes);
	if (text.length === 0) return null;
	return JSON.parse(text) as unknown;
}

/** Legacy TEXT columns stored as UTF-8 JSON strings. */
export function encodeLegacyJsonText(value: unknown): string {
	return JSON.stringify(value ?? null);
}

export function decodeLegacyJsonText(text: string): unknown {
	return JSON.parse(text) as unknown;
}

export function encodePayload(codec: PayloadCodec, value: unknown): Uint8Array {
	switch (codec) {
		case "json-v1":
			return encodeJson(value);
		case "protobuf-v1":
			if (value instanceof Uint8Array) return value;
			throw new TypeError("protobuf-v1 payload must be Uint8Array");
		default:
			throw new UnsupportedCodecError(String(codec), "payload");
	}
}

export function decodePayload(codec: string, bytes: Uint8Array): unknown {
	switch (codec) {
		case "json-v1":
			return decodeJson(bytes);
		case "protobuf-v1":
			return bytes;
		default:
			throw new UnsupportedCodecError(codec, "payload");
	}
}

export function encodeMetadata(
	codec: PayloadCodec,
	value: Record<string, unknown>,
): Uint8Array {
	return encodePayload(codec, value);
}

export function decodeMetadata(
	codec: string,
	bytes: Uint8Array,
): Record<string, unknown> {
	const decoded = decodePayload(codec, bytes);
	if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
		return {};
	}
	return decoded as Record<string, unknown>;
}

export function parseCodec(value: unknown, field: string): PayloadCodec {
	if (value === "json-v1" || value === "protobuf-v1") return value;
	throw new UnsupportedCodecError(String(value), field);
}
