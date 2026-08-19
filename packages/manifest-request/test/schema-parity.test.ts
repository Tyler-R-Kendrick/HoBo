/**
 * The decomposition is only safe if drift is detectable.
 *
 * While `@hobo/capability-profiles` still declares `SelectionCandidate` and
 * this package declares the schema for it, the two can diverge silently: a
 * field added there is simply absent here, and every digest taken through this
 * package quietly stops covering it. These tests read the other package's
 * source as text and fail when the shapes stop agreeing — including the two
 * vocabularies this package has to restate because a manifest package may not
 * depend on another package's implementation.
 *
 * They also hold the `.proto` and `.cue` to the same field set, because "the
 * schema is the contract" is a claim about files nothing else in the build
 * reads.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
	BINDLE_RUNTIMES,
	CLAIM_ATOMICITIES,
	CONTINUITY_GRADES,
	CREATOR_AUTHORITIES_AFTER_CLAIM,
	CREDENTIAL_CONTINUITY_GRADES,
	PROVIDER_CLASSES,
	parseSelectionCandidate,
	REALIZATION_KINDS,
	type SelectionCandidate,
	toSelectionCandidateRecord,
} from "../src/index.js";
import {
	BASE_CANDIDATE,
	constStringList,
	IDS_SOURCE_PATH,
	readRepoFile,
	SELECTION_SOURCE_PATH,
	SELECTION_TEST_PATH,
	sliceBlock,
	topLevelKeys,
} from "./fixtures.js";

const DATA_MODELS = join(import.meta.dirname, "..", "data-models");
const PROTO = readRepoFile(join(DATA_MODELS, "selection_candidate.proto"));
const CUE = readRepoFile(join(DATA_MODELS, "selection_candidate.cue"));
const SELECTION_SOURCE = readRepoFile(SELECTION_SOURCE_PATH);
const IDS_SOURCE = readRepoFile(IDS_SOURCE_PATH);

const PARSED_BASE = parseSelectionCandidate(BASE_CANDIDATE);
const RECORD = toSelectionCandidateRecord(PARSED_BASE);

/** Members of a `export type X = "a" | "b";` declaration, in order. */
function unionMembers(source: string, name: string): readonly string[] {
	const start = source.indexOf(`export type ${name} =`);
	if (start < 0) throw new Error(`type ${name} not found`);
	const end = source.indexOf(";", start);
	return [...source.slice(start, end).matchAll(/"([^"]+)"/gu)].map(
		(match) => match[1] as string,
	);
}

describe("parity with the shape @hobo/capability-profiles still declares", () => {
	const declaredFields = topLevelKeys(
		sliceBlock(SELECTION_SOURCE, "export type SelectionCandidate = {"),
	);

	it("models exactly the declared field set", () => {
		expect([...Object.keys(PARSED_BASE)].sort()).toStrictEqual(
			[...declaredFields].sort(),
		);
	});

	it("models exactly the declared profile-implementation field set", () => {
		const claimFields = topLevelKeys(
			sliceBlock(SELECTION_SOURCE, "export type ProfileImplementation = {"),
		);
		const claim = PARSED_BASE.implementsProfiles[0];
		expect(claim).toBeDefined();
		expect([...Object.keys(claim ?? {})].sort()).toStrictEqual(
			[...claimFields].sort(),
		);
	});

	it("carries the same closed vocabularies", () => {
		expect(PROVIDER_CLASSES).toStrictEqual(
			unionMembers(SELECTION_SOURCE, "ProviderClass"),
		);
		expect(CREATOR_AUTHORITIES_AFTER_CLAIM).toStrictEqual(
			unionMembers(SELECTION_SOURCE, "CreatorAuthorityAfterClaim"),
		);
		expect(CONTINUITY_GRADES).toStrictEqual(
			unionMembers(SELECTION_SOURCE, "ContinuityGrade"),
		);
		expect(CLAIM_ATOMICITIES).toStrictEqual(
			unionMembers(SELECTION_SOURCE, "ClaimAtomicity"),
		);
	});

	it("carries the same credential vocabulary, which is declared inline", () => {
		const block = sliceBlock(
			SELECTION_SOURCE,
			"export type SelectionCandidate = {",
		);
		const credentials = block.slice(block.indexOf("readonly credentials:"));
		const members = [
			...credentials.slice(0, credentials.indexOf(";")).matchAll(/"([^"]+)"/gu),
		].map((match) => match[1] as string);
		expect(CREDENTIAL_CONTINUITY_GRADES).toStrictEqual(members);
	});

	it("restates BINDLE_RUNTIMES and REALIZATION_KINDS without drifting", () => {
		expect(BINDLE_RUNTIMES).toStrictEqual(
			constStringList(IDS_SOURCE, "BINDLE_RUNTIMES"),
		);
		expect(REALIZATION_KINDS).toStrictEqual(
			constStringList(IDS_SOURCE, "REALIZATION_KINDS"),
		);
	});

	it("keeps the transcribed base candidate aligned with the fixture harness", () => {
		const harnessKeys = topLevelKeys(
			sliceBlock(
				readRepoFile(SELECTION_TEST_PATH),
				"const BASE: SelectionCandidate = {",
			),
		);
		expect([...Object.keys(BASE_CANDIDATE)].sort()).toStrictEqual(
			[...harnessKeys].sort(),
		);
	});
});

describe("the .proto and .cue describe the record this package emits", () => {
	const recordFields = Object.keys(RECORD);

	it("declares every record field in the protobuf message, in order", () => {
		const message = sliceBlock(PROTO, "message SelectionCandidateRecord {");
		const declared = [
			...message.matchAll(
				/^\s*(?:optional\s+|repeated\s+)?[\w.<>, ]+?\s+(\w+)\s*=\s*\d+;/gmu,
			),
		].map((match) => match[1] as string);
		expect(declared).toStrictEqual(recordFields);
	});

	it("gives every protobuf field a distinct, stable number", () => {
		const message = sliceBlock(PROTO, "message SelectionCandidateRecord {");
		const numbers = [...message.matchAll(/=\s*(\d+);/gu)].map((match) =>
			Number(match[1]),
		);
		expect(numbers).toStrictEqual([...numbers].sort((a, b) => a - b));
		expect(new Set(numbers).size).toBe(numbers.length);
	});

	it("declares every record field in the CUE definition", () => {
		const definition = sliceBlock(CUE, "#SelectionCandidateRecord: {");
		// `_`-prefixed fields are CUE's hidden constraints, not wire fields.
		const declared = [...definition.matchAll(/^\t([a-z]\w*)\??:/gmu)].map(
			(match) => match[1] as string,
		);
		expect([...declared].sort()).toStrictEqual([...recordFields].sort());
	});

	it("marks exactly the optional field optional in both schemas", () => {
		expect(PROTO).toContain("optional int64 evidence_expires_at_ms");
		expect(CUE).toContain("evidence_expires_at_ms?:");
		const optionalCueFields = [
			...sliceBlock(CUE, "#SelectionCandidateRecord: {").matchAll(
				/^\t(\w+)\?:/gmu,
			),
		].map((match) => match[1] as string);
		expect(optionalCueFields).toStrictEqual(["evidence_expires_at_ms"]);
	});

	it("keeps the CUE vocabularies aligned with the TypeScript ones", () => {
		for (const [name, members] of [
			["#ProviderClass", PROVIDER_CLASSES],
			["#CreatorAuthorityAfterClaim", CREATOR_AUTHORITIES_AFTER_CLAIM],
			["#ContinuityGrade", CONTINUITY_GRADES],
			["#CredentialContinuity", CREDENTIAL_CONTINUITY_GRADES],
			["#ClaimAtomicity", CLAIM_ATOMICITIES],
			["#BindleRuntime", BINDLE_RUNTIMES],
			["#RealizationKind", REALIZATION_KINDS],
		] as const) {
			const line = CUE.split("\n").find((entry) =>
				entry.startsWith(`${name}:`),
			);
			expect(line, `${name} is missing from the CUE schema`).toBeTypeOf(
				"string",
			);
			const declared = [...(line ?? "").matchAll(/"([^"]+)"/gu)].map(
				(match) => match[1] as string,
			);
			expect(declared, name).toStrictEqual([...members]);
		}
	});
});

describe("the candidate the fixtures describe is the candidate we parse", () => {
	it("accepts the transcribed base candidate unchanged", () => {
		const record = toSelectionCandidateRecord(
			BASE_CANDIDATE as unknown as SelectionCandidate,
		);
		expect(record.definition_id).toBe("test.definition/v1");
		expect(record.evidence_expires_at_ms).toBe(
			BASE_CANDIDATE.evidenceExpiresAtMs,
		);
	});
});
