import type { EventInput, PrincipalRef } from "@hobo/core";
import { parseEventEnvelope } from "@hobo/core";

export type ParsedStreamId = string & { readonly __brand: "ParsedStreamId" };

export type ParsedExpectedSeq = number & { readonly __brand: "ParsedExpectedSeq" };

export interface ParsedEventInput {
	readonly type: string;
	readonly v: number;
	readonly data: unknown;
	readonly meta: Readonly<Record<string, unknown>>;
	readonly idempotencyKey?: string | undefined;
}

export interface ParsedAppendContext {
	readonly streamId: ParsedStreamId;
	readonly expectedSeq: ParsedExpectedSeq;
	readonly actor: PrincipalRef;
	readonly tenant: string;
	readonly project?: string | undefined;
	readonly causationId?: string | undefined;
	readonly correlationId?: string | undefined;
	readonly lane?: string | undefined;
}

export function parseStreamId(value: unknown): ParsedStreamId {
	if (typeof value !== "string" || value.length === 0) {
		throw new TypeError("streamId must be a non-empty string");
	}
	return value as ParsedStreamId;
}

export function parseExpectedSeq(value: unknown, fieldName = "expectedSeq"): ParsedExpectedSeq {
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		throw new TypeError(`${fieldName} must be a non-negative safe integer`);
	}
	return value as ParsedExpectedSeq;
}

export function parseEventInput(value: unknown): ParsedEventInput {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new TypeError("event must be an object");
	}
	const source = value as EventInput;
	const type = requireNonEmptyString(source.type, "event.type");
	const v = normalizeVersion(source.v ?? 1);
	const meta = Object.freeze(cloneJson(source.meta ?? {}));
	const idempotencyKey = optionalString(meta.idempotencyKey, "event.meta.idempotencyKey");
	return Object.freeze({
		type,
		v,
		data: cloneJson(source.data ?? {}),
		meta,
		idempotencyKey,
	});
}

export function parseEventInputs(value: unknown): ParsedEventInput[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new TypeError("events must be a non-empty array");
	}
	return value.map((event) => parseEventInput(event));
}

export function parseAppendContext(
	streamId: unknown,
	appendOptions: unknown,
): ParsedAppendContext {
	if (!appendOptions || typeof appendOptions !== "object" || Array.isArray(appendOptions)) {
		throw new TypeError("appendOptions must be an object");
	}
	const options = appendOptions as Record<string, unknown>;
	const actor = options.actor;
	if (!actor || typeof actor !== "object" || Array.isArray(actor)) {
		throw new TypeError("appendOptions.actor must be an object");
	}

	return Object.freeze({
		streamId: parseStreamId(streamId),
		expectedSeq: parseExpectedSeq(options.expectedSeq, "appendOptions.expectedSeq"),
		actor: actor as PrincipalRef,
		tenant: requireNonEmptyString(options.tenant, "appendOptions.tenant"),
		project: optionalString(options.project, "appendOptions.project"),
		causationId: optionalString(options.causationId, "appendOptions.causationId"),
		correlationId: optionalString(options.correlationId, "appendOptions.correlationId"),
		lane: optionalString(options.lane, "appendOptions.lane"),
	});
}

export function parseStoredEnvelope(row: {
	id: string;
	type: string;
	v: number;
	stream_id: string;
	seq: number;
	ts: string;
	actor: string;
	tenant: string;
	project: string | null;
	causation_id: string | null;
	correlation_id: string | null;
	lane: string | null;
	data: string;
	meta: string;
}): ReturnType<typeof parseEventEnvelope> {
	return parseEventEnvelope({
		id: row.id,
		type: row.type,
		v: row.v,
		streamId: row.stream_id,
		seq: row.seq,
		ts: row.ts,
		actor: JSON.parse(row.actor),
		tenant: row.tenant,
		project: row.project ?? undefined,
		causationId: row.causation_id ?? undefined,
		correlationId: row.correlation_id ?? undefined,
		lane: row.lane ?? undefined,
		data: JSON.parse(row.data),
		meta: JSON.parse(row.meta),
	});
}

function normalizeVersion(value: number): number {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new TypeError("event.v must be a positive safe integer");
	}
	return value;
}

function optionalString(value: unknown, fieldName: string): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	return requireNonEmptyString(value, fieldName);
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new TypeError(`${fieldName} must be a non-empty string`);
	}
	return value;
}

function cloneJson<T>(value: T): T {
	return typeof structuredClone === "function"
		? structuredClone(value)
		: (JSON.parse(JSON.stringify(value)) as T);
}
