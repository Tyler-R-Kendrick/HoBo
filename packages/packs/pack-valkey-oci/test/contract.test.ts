/* eslint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- pact matcher parses erased JSON fixtures. */
/**
 * Provider verification for the Yard-container-executor ↔ Valkey-pack boundary.
 *
 * The pact file records what an executor asks this pack: what container to
 * start, what to probe, what argv an operation is, what binding to hand a
 * workload — and which of those requests must be refused. This test replays
 * every recorded interaction through the real pack functions (see
 * `pact-replay.ts`); nothing here re-implements the pack, and no HTTP server is
 * involved, so a drifting refusal code or a changed rendered config fails the
 * contract rather than surviving it.
 *
 * The recorded response body is a **subset** assertion: keys present in the pact
 * are compared, extra keys the implementation returns are not. A string ending
 * in `*` is a prefix match, which is how a refusal pins its stable code and the
 * start of its message without freezing the whole sentence.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { type PactRequest, respond } from "./pact-replay.js";

type Json =
	| string
	| number
	| boolean
	| null
	| readonly Json[]
	| { readonly [key: string]: Json };

type Interaction = {
	readonly description: string;
	readonly request: PactRequest;
	readonly response: { readonly status: number; readonly body: Json };
};

type Pact = {
	readonly consumer: { readonly name: string };
	readonly provider: { readonly name: string };
	readonly interactions: readonly Interaction[];
};

const PACT: Pact = JSON.parse(
	readFileSync(
		join(
			dirname(fileURLToPath(import.meta.url)),
			"..",
			"contracts",
			"pack-valkey-oci-yard-executor.pact.json",
		),
		"utf8",
	),
) as Pact;

function matches(expected: Json, actual: unknown, path: string): void {
	if (typeof expected === "string" && expected.endsWith("*")) {
		expect(String(actual), path).toMatch(
			new RegExp(
				`^${expected.slice(0, -1).replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&")}`,
				"u",
			),
		);
		return;
	}
	if (Array.isArray(expected)) {
		expect(Array.isArray(actual), path).toBe(true);
		const rows = actual as readonly unknown[];
		expect(rows.length, path).toBe(expected.length);
		expected.forEach((entry, index) => {
			matches(entry, rows[index], `${path}[${index}]`);
		});
		return;
	}
	if (expected !== null && typeof expected === "object") {
		const record = expected as { readonly [key: string]: Json };
		for (const key of Object.keys(record)) {
			matches(
				record[key] as Json,
				(actual as { readonly [key: string]: unknown })[key],
				`${path}.${key}`,
			);
		}
		return;
	}
	expect(actual, path).toEqual(expected);
}

describe(`${PACT.consumer.name} → ${PACT.provider.name}`, () => {
	it("records interactions for both participants", () => {
		expect(PACT.interactions.length).toBeGreaterThan(0);
	});

	for (const interaction of PACT.interactions) {
		it(interaction.description, async () => {
			const actual = await respond(interaction.request);
			expect(actual.status, interaction.description).toBe(
				interaction.response.status,
			);
			matches(interaction.response.body, actual.body, "body");
		});
	}

	it("never records credential material, only locators", () => {
		// A pact file is committed, reviewed, and copied into issues. The one
		// thing it must never carry is a resolved secret, so the guard is on the
		// document rather than on a reviewer's attention.
		const raw = readFileSync(
			join(
				dirname(fileURLToPath(import.meta.url)),
				"..",
				"contracts",
				"pack-valkey-oci-yard-executor.pact.json",
			),
			"utf8",
		);
		for (const line of raw.split("\n")) {
			// The one plaintext-shaped string in the file is the rejected input
			// of the interaction that exists to reject it.
			if (line.includes("authPasswordRef") || line.includes("appendArgv"))
				continue;
			expect(line).not.toMatch(/rediss?:\/\/[^"]*:[^"]*@/u);
			expect(line).not.toMatch(/"requirepass [^"]+"/u);
		}
	});
});
/* eslint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- pact matcher parses erased JSON fixtures. */
