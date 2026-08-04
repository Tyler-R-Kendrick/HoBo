// First non-routing vocabulary bound to the generic per-resource-class
// resolver: data-store offerings negotiate exactly like traffic routing.
import assert from "node:assert/strict";
import { test } from "vitest";

import {
	type DataStoreProviderProfile,
	dataStoreOffering,
	matchDataStoreOfferings,
	parseDataStoreProviderProfile,
	resolveDataStore,
} from "../src/ports/data-store-offerings.js";

function sqliteProfile(): DataStoreProviderProfile {
	return parseDataStoreProviderProfile({
		provider: "sqlite-local",
		offerings: [
			{
				id: "sql.relational",
				stability: "stable",
				fidelity: "real",
				features: [],
			},
			{
				id: "sql.transactions",
				stability: "stable",
				fidelity: "real",
				features: [],
			},
			{
				id: "journal.event-stream",
				stability: "stable",
				fidelity: "real",
				features: [],
			},
		],
		fallbacks: ["cdc.stream", "migrate.dual-write"],
	});
}

test("parse rejects unknown offering ids at the boundary", () => {
	assert.throws(
		() =>
			parseDataStoreProviderProfile({
				provider: "sqlite-local",
				offerings: [{ id: "sql.mystery" }],
			}),
		/offerings\[0\]\.id/u,
	);
});

test("prefer negotiation covers a missing native offering from the fallback ladder", () => {
	const match = matchDataStoreOfferings(sqliteProfile(), {
		features: ["sql.relational", "cdc.stream"],
		negotiation: "prefer",
	});
	assert.equal(match.kind, "partial");
	if (match.kind !== "partial") return;
	assert.deepEqual(match.offerings, ["sql.relational", "cdc.stream"]);
	assert.deepEqual(match.fallbacks, ["cdc.stream"]);
});

test("require negotiation fails closed on an offering outside native + fallbacks", () => {
	const match = matchDataStoreOfferings(sqliteProfile(), {
		features: ["replica.read"],
		negotiation: "require",
	});
	assert.equal(match.kind, "none");
	if (match.kind !== "none") return;
	assert.match(match.remediation, /data-store offerings: replica\.read/u);
});

test("resolve picks the first profile that satisfies the request", () => {
	const supabase = parseDataStoreProviderProfile({
		provider: "supabase-postgres",
		offerings: [
			{ id: "sql.relational" },
			{ id: "sql.transactions" },
			{ id: "replica.read" },
			{ id: "backup.pitr" },
		],
	});
	const resolved = resolveDataStore([sqliteProfile(), supabase], {
		features: ["sql.relational", "replica.read"],
		negotiation: "require",
	});
	assert.equal(resolved.kind, "resolved");
	if (resolved.kind !== "resolved") return;
	assert.equal(resolved.provider, "supabase-postgres");
	assert.deepEqual(resolved.strategy, ["sql.relational", "replica.read"]);
});

test("resolve reports the default missing offering when nothing is registered", () => {
	const resolved = resolveDataStore([]);
	assert.equal(resolved.kind, "unresolved");
	if (resolved.kind !== "unresolved") return;
	assert.deepEqual(resolved.missing, ["sql.relational"]);
	assert.match(resolved.remediation, /no data-store provider profiles/u);
});

test("dataStoreOffering helper defaults to stable + real", () => {
	const entry = dataStoreOffering("kv.point");
	assert.equal(entry.stability, "stable");
	assert.equal(entry.fidelity, "real");
});
