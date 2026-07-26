/**
 * The single parse boundary for untrusted registry documents (parse, don't
 * validate). Raw JSON crosses this boundary exactly once and comes out as
 * the derived domain type {@link ParsedRegistry}: generated protobuf
 * records plus structural invariants mirrored from
 * `data-models/runner_balancing.cue` (ids resolve, every routed provider
 * has a budget envelope, caps are ordered). Invalid *structure* throws;
 * invalid *cost facts* deliberately do not — they degrade to declared
 * min-cost ranking downstream in the ledger projection, because declared
 * facts are untrusted ranking input, never billing input.
 */

import { create, fromJson } from "@bufbuild/protobuf";

import {
	type BudgetEnvelope,
	BudgetEnvelopeSchema,
	type RunnerProviderProfile,
	RunnerProviderProfileSchema,
	type RunnerTrack,
	RunnerTrackSchema,
	type UsageSnapshot,
	UsageSnapshotSchema,
} from "./_generated/runner_balancing_pb.js";

export class RegistryParseError extends Error {
	readonly problems: readonly string[];

	constructor(problems: readonly string[]) {
		super(`registry document rejected: ${problems.join("; ")}`);
		this.name = "RegistryParseError";
		this.problems = problems;
	}
}

// domain-view: parse-don't-validate derived type — the registry document's
// parsed form with resolved lookups; its wire form is the generated records.
export interface ParsedRegistry {
	readonly providers: readonly RunnerProviderProfile[];
	readonly providerById: ReadonlyMap<string, RunnerProviderProfile>;
	readonly tracks: readonly RunnerTrack[];
	readonly envelopes: ReadonlyMap<string, BudgetEnvelope>;
}

const PROVIDER_ID = /^[a-z][a-z0-9_]*$/;
const VARIABLE_NAME = /^[A-Z][A-Z0-9_]*$/;

function asArray(value: unknown, field: string, problems: string[]): unknown[] {
	if (Array.isArray(value)) return value;
	problems.push(`${field} must be an array`);
	return [];
}

/** Parse one untrusted registry document into the derived domain type. */
export function parseRegistryDocument(raw: unknown): ParsedRegistry {
	const problems: string[] = [];
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		throw new RegistryParseError(["registry document must be an object"]);
	}
	const document = raw as Record<string, unknown>;

	const providers: RunnerProviderProfile[] = [];
	for (const [index, entry] of asArray(
		document.providers,
		"providers",
		problems,
	).entries()) {
		try {
			providers.push(fromJson(RunnerProviderProfileSchema, entry as never));
		} catch (error) {
			problems.push(`providers[${index}]: ${String(error)}`);
		}
	}

	const tracks: RunnerTrack[] = [];
	for (const [index, entry] of asArray(
		document.tracks,
		"tracks",
		problems,
	).entries()) {
		try {
			tracks.push(fromJson(RunnerTrackSchema, entry as never));
		} catch (error) {
			problems.push(`tracks[${index}]: ${String(error)}`);
		}
	}

	const envelopes = new Map<string, BudgetEnvelope>();
	for (const [index, entry] of asArray(
		document.envelopes,
		"envelopes",
		problems,
	).entries()) {
		try {
			const envelope = fromJson(BudgetEnvelopeSchema, entry as never);
			envelopes.set(envelope.providerId, envelope);
		} catch (error) {
			problems.push(`envelopes[${index}]: ${String(error)}`);
		}
	}

	const providerById = new Map<string, RunnerProviderProfile>();
	for (const provider of providers) {
		if (!PROVIDER_ID.test(provider.id)) {
			problems.push(`provider id ${JSON.stringify(provider.id)} is not snake_case`);
			continue;
		}
		if (providerById.has(provider.id)) {
			problems.push(`duplicate provider id ${provider.id}`);
			continue;
		}
		if (provider.runsOnLabels.length === 0) {
			problems.push(`provider ${provider.id} declares no runs-on labels`);
		}
		providerById.set(provider.id, provider);
	}

	if (tracks.length === 0) {
		problems.push("registry declares no tracks");
	}
	for (const track of tracks) {
		if (!VARIABLE_NAME.test(track.variable)) {
			problems.push(
				`track ${track.resource || "(unnamed)"} variable ${JSON.stringify(track.variable)} is not an Actions variable name`,
			);
		}
		if (track.rungs.length === 0) {
			problems.push(`track ${track.resource} declares no rungs`);
		}
		for (const rung of track.rungs) {
			if (!providerById.has(rung.providerId)) {
				problems.push(
					`track ${track.resource} rung ${rung.value} references unknown provider ${rung.providerId}`,
				);
				continue;
			}
			if (!envelopes.has(rung.providerId)) {
				problems.push(
					`provider ${rung.providerId} is routed by track ${track.resource} but has no budget envelope`,
				);
			}
		}
	}

	for (const envelope of envelopes.values()) {
		if (envelope.hardCapUsd < envelope.softCapUsd) {
			problems.push(
				`envelope ${envelope.providerId} hard cap ${envelope.hardCapUsd} sits below soft cap ${envelope.softCapUsd}`,
			);
		}
	}

	if (problems.length > 0) {
		throw new RegistryParseError(problems);
	}
	return { providers, providerById, tracks, envelopes };
}

/**
 * Parse one untrusted usage document (operator override or adapter payload)
 * into generated UsageSnapshot records; unusable entries are dropped, not
 * guessed at.
 */
export function parseUsageSnapshots(raw: unknown): UsageSnapshot[] {
	if (!Array.isArray(raw)) return [];
	const snapshots: UsageSnapshot[] = [];
	for (const entry of raw) {
		try {
			const snapshot = fromJson(UsageSnapshotSchema, entry as never);
			if (
				snapshot.providerId !== "" &&
				Number.isFinite(snapshot.spendUsd) &&
				snapshot.spendUsd >= 0 &&
				Number.isFinite(snapshot.unitsUsed) &&
				snapshot.unitsUsed >= 0
			) {
				snapshots.push(snapshot);
			}
		} catch {
			// Unusable rows are evidence of a bad source, not a reason to guess.
		}
	}
	return snapshots;
}

/** Build an unknown-usage snapshot (honest degradation for silent sources). */
export function unknownUsage(providerId: string, source: string): UsageSnapshot {
	return create(UsageSnapshotSchema, {
		providerId,
		spendUsd: 0,
		unitsUsed: 0,
		known: false,
		source,
	});
}
