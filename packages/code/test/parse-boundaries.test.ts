/**
 * The parse boundary: untrusted input becomes a frozen domain type, or throws.
 *
 * The module's own header states the rule — *parse, don't validate* — and the
 * point of it is that downstream code accepts only parsed types, so anything
 * that gets through here is trusted everywhere afterwards. Four parsers, and
 * three of them enforce a property that is not merely a shape check:
 *
 * **A guest cannot assign host trust.** `parseGuestEvidenceSubmission` rejects
 * six fields outright — `verification`, `origin`, `actor`, `recordedAt`,
 * `path`, `uri` — because those are the host's to decide. A guest that could
 * set `verification` would be attesting to its own evidence; one that could
 * set `origin` or `actor` would be signing it as someone else. Rejecting
 * rather than ignoring is the right call: silently dropping the field would
 * accept a submission whose author believed it was doing something else.
 *
 * **`mediatedOnly` must be `true`.** Not "defaults to true" — an isolation
 * context that omitted it, or set it false, is refused. The whole safety model
 * of agent isolation is that edits stay in the sandbox until an audited
 * promote; a parser that let the flag default would let a caller opt out of it
 * by saying nothing.
 *
 * **`squashOnly` must be `true`.** Same shape of rule, for the same reason:
 * exclusive squash-merge is the promotion contract, and a request that did not
 * say so is not a promotion request.
 *
 * Everything else is the ordinary work of a parse boundary — required strings
 * are non-empty, closed sets are closed, artifact references are content
 * addresses and not paths, and every result is frozen so a caller downstream
 * cannot edit what was parsed.
 */
import { describe, expect, it } from "vitest";

import {
	parseEvidenceTriple,
	parseGuestEvidenceSubmission,
	parseIsolationContext,
	parsePromotionRequest,
} from "../src/parse.js";
import { CODE_EVIDENCE_SCHEMA, CODE_ISOLATION_SCHEMA } from "../src/types.js";

const SHA = `sha256:${"a".repeat(64)}`;

const evidence = (patch: Record<string, unknown> = {}) => ({
	kind: "note",
	title: "a title",
	summary: "a summary",
	subject: "a subject",
	...patch,
});

const isolation = (patch: Record<string, unknown> = {}) => ({
	schemaVersion: CODE_ISOLATION_SCHEMA,
	runId: "run-1",
	branch: "code/thing",
	rootPath: "/tmp/root",
	backend: {
		kind: "worktree",
		platform: "linux-generic",
		cowCapable: false,
		reason: "no cow filesystem",
	},
	durableRoot: "/tmp/durable",
	createdAt: "2026-01-01T00:00:00.000Z",
	status: "open",
	projectRoot: "/tmp/project",
	mediatedOnly: true,
	...patch,
});

const promotion = (patch: Record<string, unknown> = {}) => ({
	runId: "run-1",
	isolationRoot: "/tmp/root",
	targetProject: "/tmp/project",
	squashOnly: true,
	...patch,
});

const triple = (patch: Record<string, unknown> = {}) => ({
	schemaVersion: CODE_EVIDENCE_SCHEMA,
	flagKey: "flag",
	scenario: "a scenario",
	playwrightScriptPath: "/tmp/spec.ts",
	recordingMp4Path: "/tmp/run.mp4",
	screenshotPaths: ["/tmp/one.png"],
	durableRoot: "/tmp/durable",
	...patch,
});

describe("a guest cannot assign host trust", () => {
	it.each([
		"verification",
		"origin",
		"actor",
		"recordedAt",
		"path",
		"uri",
	])("refuses guest-supplied %s", (field) => {
		// These are the host's to decide. A guest that could set
		// `verification` would be attesting to its own evidence; one that
		// could set `origin` or `actor` would be signing it as someone else.
		expect(() =>
			parseGuestEvidenceSubmission(evidence({ [field]: "anything" })),
		).toThrow(new RegExp(`${field} is host-owned`));
	});

	it("refuses a host-owned field even when it is null", () => {
		// Presence is what is checked, not truthiness -- `in` rather than a
		// value test. A null `actor` is still a guest claiming that key.
		expect(() =>
			parseGuestEvidenceSubmission(evidence({ actor: null })),
		).toThrow(/host-owned/);
	});

	it("refuses rather than silently dropping the field", () => {
		// Dropping it would accept a submission whose author believed it was
		// doing something else -- the guest walks away thinking it recorded an
		// origin that was never stored.
		expect(() =>
			parseGuestEvidenceSubmission(evidence({ origin: "guest" })),
		).toThrow();
	});

	it("accepts a submission that claims none of them", () => {
		expect(parseGuestEvidenceSubmission(evidence()).kind).toBe("note");
	});
});

describe("what a guest may submit", () => {
	it.each([
		"status",
		"test",
		"feature",
		"decision",
		"diagram",
		"screenshot",
		"recording",
		"replay",
		"annotation",
		"note",
	])("accepts the %s kind", (kind) => {
		expect(parseGuestEvidenceSubmission(evidence({ kind })).kind).toBe(kind);
	});

	it("refuses a kind outside the closed set", () => {
		// The kind decides how evidence is rendered and indexed; an unknown one
		// would be stored and then never shown.
		expect(() =>
			parseGuestEvidenceSubmission(evidence({ kind: "vibes" })),
		).toThrow(/hobo:evidence kind/);
	});

	it.each(["title", "summary", "subject"])("requires a %s", (field) => {
		expect(() =>
			parseGuestEvidenceSubmission(evidence({ [field]: "" })),
		).toThrow(/non-empty string/);
	});

	it("names the field it refused", () => {
		// The submission came over a wire from another process; "invalid" with
		// no field name is not something the sender can act on.
		expect(() => parseGuestEvidenceSubmission(evidence({ title: "" }))).toThrow(
			/title/,
		);
	});

	it("accepts a content-addressed artifact reference", () => {
		expect(
			parseGuestEvidenceSubmission(evidence({ artifactRefs: [SHA] }))
				.artifactRefs,
		).toStrictEqual([SHA]);
	});

	it("refuses a path where a content address belongs", () => {
		// An artifact ref is a hash, not a location. Accepting a path would let
		// a guest point the host at a file of its choosing.
		expect(() =>
			parseGuestEvidenceSubmission(evidence({ artifactRefs: ["/etc/passwd"] })),
		).toThrow(/sha256 reference/);
	});

	it("refuses a hash of the wrong length", () => {
		expect(() =>
			parseGuestEvidenceSubmission(evidence({ artifactRefs: ["sha256:abc"] })),
		).toThrow(/sha256 reference/);
	});

	it("refuses an upper-case hash", () => {
		// The pattern is lower-case hex on purpose: two spellings of one digest
		// would compare unequal and store the same artifact twice.
		expect(() =>
			parseGuestEvidenceSubmission(
				evidence({ artifactRefs: [`sha256:${"A".repeat(64)}`] }),
			),
		).toThrow(/sha256 reference/);
	});

	it("says which reference in the list was wrong", () => {
		expect(() =>
			parseGuestEvidenceSubmission(
				evidence({ artifactRefs: [SHA, "not-a-hash"] }),
			),
		).toThrow(/artifactRefs\[1\]/);
	});

	it("treats a missing artifact list as empty", () => {
		// Evidence with no attachments is ordinary; requiring the key would
		// make every caller send an empty array.
		expect(parseGuestEvidenceSubmission(evidence()).artifactRefs).toStrictEqual(
			[],
		);
	});

	it("treats a non-array artifact list as empty rather than throwing", () => {
		// Recorded as observed: a string here is ignored rather than refused.
		expect(
			parseGuestEvidenceSubmission(evidence({ artifactRefs: "nope" }))
				.artifactRefs,
		).toStrictEqual([]);
	});

	it("carries an optional source reference when given", () => {
		expect(
			parseGuestEvidenceSubmission(evidence({ sourceRef: "PR #12" })).sourceRef,
		).toBe("PR #12");
	});

	it("omits the source reference rather than emitting undefined", () => {
		expect("sourceRef" in parseGuestEvidenceSubmission(evidence())).toBe(false);
	});

	it("refuses an empty source reference when the key is present", () => {
		// Present-but-empty is a caller bug, not an absent field.
		expect(() =>
			parseGuestEvidenceSubmission(evidence({ sourceRef: "" })),
		).toThrow(/sourceRef/);
	});

	it("freezes what it returns", () => {
		// Downstream code accepts only parsed types and does not re-check them.
		expect(Object.isFrozen(parseGuestEvidenceSubmission(evidence()))).toBe(
			true,
		);
	});

	it("freezes the artifact list too", () => {
		expect(
			Object.isFrozen(
				parseGuestEvidenceSubmission(evidence({ artifactRefs: [SHA] }))
					.artifactRefs,
			),
		).toBe(true);
	});

	it.each([
		undefined,
		null,
		"a string",
		42,
		[],
	])("refuses %s as a submission", (input) => {
		expect(() => parseGuestEvidenceSubmission(input as never)).toThrow(
			/must be an object/,
		);
	});
});

describe("isolation context", () => {
	it("parses a well-formed context", () => {
		expect(parseIsolationContext(isolation()).runId).toBe("run-1");
	});

	it("requires mediatedOnly to be true", () => {
		// The whole safety model: edits stay in the sandbox until an audited
		// promote.
		expect(() =>
			parseIsolationContext(isolation({ mediatedOnly: false })),
		).toThrow(/mediatedOnly must be true/);
	});

	it("does not let mediatedOnly default by omission", () => {
		// A parser that let it default would let a caller opt out of the safety
		// model by saying nothing.
		const { mediatedOnly: _dropped, ...without } = isolation();
		expect(() => parseIsolationContext(without)).toThrow(/mediatedOnly/);
	});

	it("refuses a mismatched schema version", () => {
		// The context is written by one version and read by another; a silent
		// mismatch would misread every field after it.
		expect(() =>
			parseIsolationContext(isolation({ schemaVersion: "something/v0" })),
		).toThrow(/schemaVersion must be/);
	});

	it.each(["rift", "worktree"])("accepts the %s backend", (kind) => {
		expect(
			parseIsolationContext(
				isolation({ backend: { ...isolation().backend, kind } }),
			).backend.kind,
		).toBe(kind);
	});

	it("refuses a backend outside the closed set", () => {
		expect(() =>
			parseIsolationContext(
				isolation({ backend: { ...isolation().backend, kind: "magic" } }),
			),
		).toThrow(/rift\|worktree/);
	});

	it.each(["open", "cleaned", "failed"])("accepts the %s status", (status) => {
		expect(parseIsolationContext(isolation({ status })).status).toBe(status);
	});

	it("refuses a status outside the closed set", () => {
		// Status drives cleanup: an unknown one would leave a worktree nobody
		// reclaims.
		expect(() =>
			parseIsolationContext(isolation({ status: "probably-fine" })),
		).toThrow(/open\|cleaned\|failed/);
	});

	it("requires the backend to be an object", () => {
		expect(() =>
			parseIsolationContext(isolation({ backend: "worktree" })),
		).toThrow(/backend must be an object/);
	});

	it("requires the cow capability to be a real boolean", () => {
		// A truthy string here would claim copy-on-write on a filesystem that
		// has none, and the isolation would fail at use rather than at parse.
		expect(() =>
			parseIsolationContext(
				isolation({ backend: { ...isolation().backend, cowCapable: "yes" } }),
			),
		).toThrow(/must be a boolean/);
	});

	it("carries an optional station id", () => {
		expect(
			parseIsolationContext(isolation({ stationId: "station-1" })).stationId,
		).toBe("station-1");
	});

	it("omits an empty station id rather than carrying a blank", () => {
		// A blank id would compare unequal to "absent" everywhere downstream.
		expect(
			"stationId" in parseIsolationContext(isolation({ stationId: "" })),
		).toBe(false);
	});

	it("omits an absent station id", () => {
		expect("stationId" in parseIsolationContext(isolation())).toBe(false);
	});

	it.each([
		"runId",
		"branch",
		"rootPath",
		"durableRoot",
		"createdAt",
		"projectRoot",
	])("requires %s", (field) => {
		expect(() => parseIsolationContext(isolation({ [field]: "" }))).toThrow(
			new RegExp(field),
		);
	});

	it("freezes what it returns", () => {
		expect(Object.isFrozen(parseIsolationContext(isolation()))).toBe(true);
	});

	it("freezes the backend too", () => {
		// A shallow freeze would leave the field that decides the isolation
		// mechanism writable.
		expect(Object.isFrozen(parseIsolationContext(isolation()).backend)).toBe(
			true,
		);
	});
});

describe("promotion request", () => {
	it("parses a well-formed request", () => {
		expect(parsePromotionRequest(promotion()).runId).toBe("run-1");
	});

	it("requires squashOnly to be true", () => {
		// Exclusive squash-merge is the promotion contract; a request that did
		// not say so is not a promotion request.
		expect(() =>
			parsePromotionRequest(promotion({ squashOnly: false })),
		).toThrow(/exclusive squash-merge/);
	});

	it("does not let squashOnly default by omission", () => {
		const { squashOnly: _dropped, ...without } = promotion();
		expect(() => parsePromotionRequest(without)).toThrow(/squashOnly/);
	});

	it.each([
		"runId",
		"isolationRoot",
		"targetProject",
	])("requires %s", (field) => {
		expect(() => parsePromotionRequest(promotion({ [field]: "" }))).toThrow(
			new RegExp(field),
		);
	});

	it("keeps the gate results it was given", () => {
		// What passed before promoting is the audit trail.
		expect(
			parsePromotionRequest(promotion({ gateResults: ["lint", "test"] }))
				.gateResults,
		).toStrictEqual(["lint", "test"]);
	});

	it("drops a non-string gate result rather than refusing", () => {
		// Recorded as observed: the list is filtered, not validated. A number
		// among the gates is silently discarded.
		expect(
			parsePromotionRequest(promotion({ gateResults: ["lint", 7, "test"] }))
				.gateResults,
		).toStrictEqual(["lint", "test"]);
	});

	it("treats a missing gate list as empty", () => {
		expect(parsePromotionRequest(promotion()).gateResults).toStrictEqual([]);
	});

	it("treats a non-array gate list as empty", () => {
		expect(
			parsePromotionRequest(promotion({ gateResults: "lint" })).gateResults,
		).toStrictEqual([]);
	});

	it("freezes what it returns", () => {
		expect(Object.isFrozen(parsePromotionRequest(promotion()))).toBe(true);
	});

	it("freezes the gate list too", () => {
		expect(
			Object.isFrozen(
				parsePromotionRequest(promotion({ gateResults: ["lint"] })).gateResults,
			),
		).toBe(true);
	});
});

describe("evidence triple", () => {
	it("parses a well-formed triple", () => {
		expect(parseEvidenceTriple(triple()).flagKey).toBe("flag");
	});

	it("refuses a mismatched schema version", () => {
		expect(() =>
			parseEvidenceTriple(triple({ schemaVersion: "something/v0" })),
		).toThrow(/schemaVersion must be/);
	});

	it("requires at least one screenshot", () => {
		// The triple is script plus recording plus screenshots; a triple with
		// no screenshots is not the artifact it claims to be.
		expect(() => parseEvidenceTriple(triple({ screenshotPaths: [] }))).toThrow(
			/screenshotPaths must be non-empty/,
		);
	});

	it("refuses a missing screenshot list", () => {
		const { screenshotPaths: _dropped, ...without } = triple();
		expect(() => parseEvidenceTriple(without)).toThrow(/screenshotPaths/);
	});

	it("refuses a screenshot list whose entries are all non-strings", () => {
		// Filtered then length-checked, so a list of numbers is refused for
		// being empty rather than accepted as junk.
		expect(() =>
			parseEvidenceTriple(triple({ screenshotPaths: [1, 2] })),
		).toThrow(/screenshotPaths/);
	});

	it("keeps several screenshots", () => {
		expect(
			parseEvidenceTriple(triple({ screenshotPaths: ["/a.png", "/b.png"] }))
				.screenshotPaths,
		).toStrictEqual(["/a.png", "/b.png"]);
	});

	it.each([
		"flagKey",
		"scenario",
		"playwrightScriptPath",
		"recordingMp4Path",
		"durableRoot",
	])("requires %s", (field) => {
		expect(() => parseEvidenceTriple(triple({ [field]: "" }))).toThrow(
			new RegExp(field),
		);
	});

	it("freezes what it returns", () => {
		expect(Object.isFrozen(parseEvidenceTriple(triple()))).toBe(true);
	});

	it("freezes the screenshot list too", () => {
		expect(Object.isFrozen(parseEvidenceTriple(triple()).screenshotPaths)).toBe(
			true,
		);
	});
});
