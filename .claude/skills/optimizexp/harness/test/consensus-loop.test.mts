import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { COUNCIL_PERSONAS, type CouncilState } from "../lib/design-council.mts";
import { runConsensusCommand } from "../../workflows/cross-agent/consensus-loop.mts";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../..");
const CLI = path.join(REPO, ".agents/skills/optimizexp/workflows/cross-agent/consensus-loop.mts");
if (!CLI.endsWith("consensus-loop.mts")) throw new Error(CLI);
const sha = (character: string) => character.repeat(64);

function seedRepo(): string {
	const root = mkdtempSync(path.join(tmpdir(), "design-council-"));
	mkdirSync(path.join(root, ".optimizexp", "bus", "entries"), { recursive: true });
	mkdirSync(path.join(root, ".git"));
	return root;
}

function proposal(root: string, overrides: Record<string, unknown> = {}): string {
	const file = path.join(root, "proposal.json");
	writeFileSync(file, `${JSON.stringify({
		schemaVersion: 1,
		subject: { kind: "surface", surface: "designer council test" },
		changedPaths: ["src/internal/cache.ts"],
		normalizedDiffHash: sha("c"),
		acceptanceDigest: sha("d"),
		evidenceDigest: sha("e"),
		relevanceSignals: { categories: [], acceptanceTags: [], featureTags: [], keywords: [] },
		evidenceSignals: { evidenceTypes: [], currentHead: true, acceptanceMapped: true },
		...overrides,
	}, null, 2)}\n`);
	return file;
}

function run(root: string, args: string[]) {
	const result = runConsensusCommand(["--root", root, ...args]);
	return { code: result.exitCode, json: result.output, output: JSON.stringify(result.output) };
}

function init(root: string, file = proposal(root)) {
	const result = run(root, [
		"--mode", "init", "--run", "run-1", "--review", "review-1",
		"--base-sha", sha("a"), "--head-sha", sha("b"), "--proposal", file,
	]);
	assert.equal(result.code, 0, result.output);
	if (!result.json.state) throw new Error(`${CLI} ${JSON.stringify(result)}`);
	return result.json.state as CouncilState;
}

function append(root: string, state: CouncilState, persona: string, stage: "submitted" | "position" | "vote", body: Record<string, unknown> = {}) {
	const personaState = state.personas[persona as keyof typeof state.personas];
	const consumes = stage === "position";
	const decay = consumes ? personaState.decayPerTurn : 0;
	const after = consumes ? Math.round(Math.max(0, personaState.currentInvestment - decay) * 10_000) / 10_000 : personaState.currentInvestment;
	const file = path.join(root, `${persona}-${stage}-${state.turn + 1}.json`);
	writeFileSync(file, `${JSON.stringify({
		kind: "council", schemaVersion: 1, id: `${persona}-${stage}-${state.turn + 1}`,
		runId: state.runId, reviewId: state.reviewId, cycle: state.cycle, turn: state.turn + 1,
		stage, subject: { headSha: state.subject.headSha, proposalDigest: state.subject.proposalDigest },
		createdAt: `2026-08-01T12:00:${String(state.turn + 1).padStart(2, "0")}.000Z`,
		persona, respondsTo: [],
		investment: {
			relevance: personaState.relevance, evidenceStrength: personaState.evidenceStrength,
			before: personaState.currentInvestment, decay, after,
			submitted: stage === "submitted",
		},
		stance: stage === "submitted" || stage === "vote" ? "yay" : null,
		blindSpotCheck: stage === "submitted" || stage === "vote" ? "This lens may overreach; repository evidence remains authoritative." : undefined,
		arguments: [], hardBlockers: [], preferences: [], evidenceRefs: [], requestedChanges: [],
		...body,
	}, null, 2)}\n`);
	return run(root, ["--mode", "append", "--run", state.runId, "--review", state.reviewId, "--entry", file]);
}

describe("designer consensus CLI", () => {
	it("opens, records exact-six zero-investment submissions, decides, and asserts current approval", () => {
		const root = seedRepo();
		try {
			const manifest = proposal(root);
			let state = init(root, manifest);
			assert.equal(state.status, "open");
			assert.deepEqual(state.council, COUNCIL_PERSONAS);
			for (const persona of COUNCIL_PERSONAS) {
				assert.equal(state.personas[persona].currentInvestment, 0);
				const result = append(root, state, persona, "submitted");
				assert.equal(result.code, 0, result.output);
				state = result.json.state as CouncilState;
			}
			const decided = run(root, ["--mode", "decide", "--run", "run-1", "--review", "review-1"]);
			assert.equal(decided.code, 0, decided.output);
			assert.equal((decided.json.decision as Record<string, unknown>).result, "yay");
			const approved = decided.json.state as CouncilState;
			assert.equal(approved.status, "approved");
			const asserted = run(root, [
				"--mode", "assert-yay", "--run", "run-1", "--review", "review-1",
				"--head-sha", sha("b"), "--proposal", manifest,
			]);
			assert.equal(asserted.code, 0, asserted.output);
			assert.equal(asserted.json.ok, true);
			const closed = run(root, [
				"--mode", "close", "--run", "run-1", "--review", "review-1", "--result", "approved",
				"--head-sha", sha("b"), "--proposal", manifest,
			]);
			assert.equal(closed.code, 0, closed.output);
			assert.equal(closed.json.result, "yay");
			assert.equal((closed.json.state as CouncilState).status, "closed");
			assert.equal((closed.json.state as CouncilState).closedResult, "yay");
			const assertedAfterClose = run(root, [
				"--mode", "assert-yay", "--run", "run-1", "--review", "review-1",
				"--head-sha", sha("b"), "--proposal", manifest,
			]);
			assert.equal(assertedAfterClose.code, 0, assertedAfterClose.output);
			assert.equal(assertedAfterClose.json.result, "yay");
			assert.equal(typeof assertedAfterClose.json.closedEntryId, "string");
			proposal(root, { evidenceDigest: sha("9") });
			const alteredEvidence = run(root, [
				"--mode", "assert-yay", "--run", "run-1", "--review", "review-1",
				"--head-sha", sha("b"), "--proposal", manifest,
			]);
			assert.notEqual(alteredEvidence.code, 0);
			assert.match(alteredEvidence.output, /stale-proposal/);
			const stale = run(root, [
				"--mode", "assert-yay", "--run", "run-1", "--review", "review-1",
				"--head-sha", sha("f"), "--proposal", manifest,
			]);
			assert.notEqual(stale.code, 0);
			assert.match(stale.output, /stale-head/);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it("hard-blocker nay emits rework and carries investment without recharge", () => {
		const root = seedRepo();
		try {
			const file = proposal(root, {
				relevanceSignals: { categories: ["api-naming"], acceptanceTags: [], featureTags: [], keywords: [] },
				evidenceSignals: { evidenceTypes: ["executable-test"], currentHead: true, acceptanceMapped: true },
			});
			let state = init(root, file);
			const jony = state.personas["jony-ive"];
			assert.ok(jony.currentInvestment > 0);
			let result = append(root, state, "steve-jobs", "submitted");
			assert.equal(result.code, 0, result.output);
			state = result.json.state as CouncilState;
			result = append(root, state, "jony-ive", "position", {
				stance: "nay",
				arguments: [{ id: "A-jony-1", claim: "The public type and CLI names contradict.", kind: "hard-blocker", respondsTo: [], evidenceRefs: ["test/name-contract"], requestedChange: "Use one public name." }],
				hardBlockers: [{ id: "HB-jony-ive-001", claim: "Public names contradict the acceptance contract.", rule: "acceptance:name-symmetry", evidenceRefs: ["test/name-contract"], requestedResolution: "Align the names and pass the contract test.", status: "open" }],
			});
			assert.equal(result.code, 0, result.output);
			state = result.json.state as CouncilState;
			for (const persona of COUNCIL_PERSONAS.filter((id) => id !== "steve-jobs" && id !== "jony-ive")) {
				result = append(root, state, persona, "submitted");
				assert.equal(result.code, 0, result.output);
				state = result.json.state as CouncilState;
			}
			result = append(root, state, "jony-ive", "vote", { stance: "nay", respondsTo: ["A-jony-1"] });
			assert.equal(result.code, 0, result.output);
			state = result.json.state as CouncilState;
			const decided = run(root, ["--mode", "decide", "--run", "run-1", "--review", "review-1"]);
			assert.equal(decided.code, 0, decided.output);
			assert.equal((decided.json.decision as Record<string, unknown>).result, "nay");
			state = decided.json.state as CouncilState;
			assert.equal(state.status, "rework-required");
			const oldInvestment = state.personas["jony-ive"].currentInvestment;

			const refreshed = proposal(root, {
				normalizedDiffHash: sha("9"), evidenceDigest: sha("8"),
				relevanceSignals: { categories: ["api-naming"], acceptanceTags: [], featureTags: [], keywords: [] },
				evidenceSignals: { evidenceTypes: ["executable-test", "screenshot"], currentHead: true, acceptanceMapped: true },
			});
			const resumed = run(root, [
				"--mode", "init", "--run", "run-1", "--review", "review-1",
				"--base-sha", sha("a"), "--head-sha", sha("7"), "--proposal", refreshed,
			]);
			assert.equal(resumed.code, 0, resumed.output);
			const next = resumed.json.state as CouncilState;
			assert.equal(next.cycle, 1);
			assert.ok(next.personas["jony-ive"].currentInvestment <= oldInvestment);
			assert.equal(next.personas["jony-ive"].hardBlockers[0]?.status, "open");
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it("fails closed on forged coordinator stages, invalid investment, duplicate ids, and old bus compatibility", () => {
		const root = seedRepo();
		try {
			let state = init(root);
			const bad = append(root, state, "steve-jobs", "position", {
				investment: { relevance: 0, evidenceStrength: 0, before: 0, decay: 0, after: -1, submitted: false },
			});
			assert.notEqual(bad.code, 0);
			assert.match(bad.output, /normalized-investment|investment-decay/);

			const forgedFile = path.join(root, "forged.json");
			writeFileSync(forgedFile, JSON.stringify({
				kind: "council", schemaVersion: 1, id: "forged", runId: "run-1", reviewId: "review-1",
				cycle: 0, turn: 1, stage: "consensus", subject: { headSha: sha("b"), proposalDigest: state.subject.proposalDigest },
				createdAt: "2026-08-01T12:00:01.000Z", persona: "steve-jobs", votes: {}, result: "yay",
			}));
			const forged = run(root, ["--mode", "append", "--run", "run-1", "--review", "review-1", "--entry", forgedFile]);
			assert.notEqual(forged.code, 0);
			assert.match(forged.output, /coordinator-only-stage/);

			const okay = append(root, state, "steve-jobs", "submitted");
			assert.equal(okay.code, 0, okay.output);
			state = okay.json.state as CouncilState;
			const duplicate = run(root, ["--mode", "append", "--run", "run-1", "--review", "review-1", "--entry", path.join(root, "steve-jobs-submitted-1.json")]);
			assert.equal(duplicate.code, 0, duplicate.output);
			assert.equal(duplicate.json.idempotent, true);

			writeFileSync(path.join(root, ".optimizexp/bus/entries/existing-expect.json"), JSON.stringify({ kind: "expect", id: "legacy", runId: "legacy" }));
			writeFileSync(path.join(root, ".optimizexp/bus/entries/existing-survey.json"), JSON.stringify({ kind: "survey", id: "legacy-survey", runId: "legacy" }));
			const validated = run(root, ["--mode", "validate"]);
			assert.equal(validated.code, 0, validated.output);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it("enforces opening order and forbids direct final-vote shortcuts", () => {
		const root = seedRepo();
		try {
			const file = proposal(root, { relevanceSignals: { categories: ["design"], acceptanceTags: [], featureTags: [], keywords: [] } });
			const state = init(root, file);
			const outOfOrder = append(root, state, "jony-ive", "position");
			assert.notEqual(outOfOrder.code, 0);
			assert.match(outOfOrder.output, /deterministic-speaking-order/);
			const disappearingBlocker = append(root, state, "steve-jobs", "position", {
				arguments: [{ id: "A-steve-HB", claim: "Acceptance failed.", kind: "hard-blocker", respondsTo: [], evidenceRefs: ["test/failure"], requestedChange: "Fix the acceptance failure." }],
			});
			assert.notEqual(disappearingBlocker.code, 0);
			assert.match(disappearingBlocker.output, /hard-blocker-classification/);
			const ambiguousBlockers = append(root, state, "steve-jobs", "position", {
				arguments: ["one", "two"].map((suffix) => ({ id: `A-steve-${suffix}`, claim: `Acceptance ${suffix} failed.`, kind: "hard-blocker", respondsTo: [], evidenceRefs: ["test/shared"], requestedChange: `Fix ${suffix}.` })),
				hardBlockers: ["one", "two"].map((suffix) => ({ id: `HB-steve-${suffix}`, claim: `Blocker ${suffix}.`, rule: `acceptance:${suffix}`, evidenceRefs: ["test/shared"], requestedResolution: `Resolve ${suffix}.`, status: "open" })),
			});
			assert.notEqual(ambiguousBlockers.code, 0);
			assert.match(ambiguousBlockers.output, /hard-blocker-classification/);
			const directVote = append(root, state, "steve-jobs", "vote");
			assert.notEqual(directVote.code, 0);
			assert.match(directVote.output, /opening-round-incomplete|opening-position-required/);
			const directSubmit = append(root, state, "steve-jobs", "submitted");
			assert.notEqual(directSubmit.code, 0);
			assert.match(directSubmit.output, /submitted-transition/);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it("relevance mode returns a machine-readable internal exemption", () => {
		const root = seedRepo();
		try {
			const file = path.join(root, "relevance.json");
			writeFileSync(file, JSON.stringify({
				changedPaths: ["src/internal/cache.ts"],
				exemption: { code: "internal-no-public-behavior", justification: "Private cache rename; exported behavior and errors unchanged." },
			}));
			const result = run(root, ["--mode", "relevance", "--input", file]);
			assert.equal(result.code, 0, result.output);
			assert.equal(result.json.required, false);
			assert.equal(result.json.exemptionAccepted, true);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it("diagnostic maximum turns blocks and never approves", () => {
		const root = seedRepo();
		try {
			const file = proposal(root);
			const opened = run(root, [
				"--mode", "init", "--run", "run-1", "--review", "review-1", "--base-sha", sha("a"),
				"--head-sha", sha("b"), "--proposal", file, "--max-turns", "1",
			]);
			let state = opened.json.state as CouncilState;
			let result = append(root, state, "steve-jobs", "submitted");
			assert.equal(result.code, 0, result.output);
			state = result.json.state as CouncilState;
			result = append(root, state, "jony-ive", "submitted");
			assert.equal(result.code, 1, result.output);
			assert.equal(result.json.blocked, true);
			assert.equal((result.json.state as CouncilState).status, "blocked");
			const closed = run(root, ["--mode", "close", "--run", "run-1", "--review", "review-1", "--result", "blocked", "--reason", "Diagnostic turn ceiling with unresolved discussion."]);
			assert.equal(closed.code, 0, closed.output);
			assert.equal(closed.json.result, "blocked");
			assert.equal((closed.json.state as CouncilState).status, "closed");
			assert.notEqual((closed.json.entry as Record<string, unknown>).result, "yay");
			const assertion = run(root, ["--mode", "assert-yay", "--run", "run-1", "--review", "review-1", "--head-sha", sha("b"), "--proposal", file]);
			assert.notEqual(assertion.code, 0);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it("rejects an illegal open to approved or blocked close", () => {
		const root = seedRepo();
		try {
			const file = proposal(root);
			init(root, file);
			const approved = run(root, ["--mode", "close", "--run", "run-1", "--review", "review-1", "--result", "approved", "--head-sha", sha("b"), "--proposal", file]);
			assert.notEqual(approved.code, 0);
			assert.match(approved.output, /not-approved/);
			const blocked = run(root, ["--mode", "close", "--run", "run-1", "--review", "review-1", "--result", "blocked"]);
			assert.notEqual(blocked.code, 0);
			assert.match(blocked.output, /illegal-transition/);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it("never proves yay for user or safety closed reviews", () => {
		for (const result of ["user", "safety"] as const) {
			const root = seedRepo();
			try {
				const file = proposal(root);
				init(root, file);
				const closed = run(root, ["--mode", "close", "--run", "run-1", "--review", "review-1", "--result", result, "--reason", `${result} termination.`]);
				assert.equal(closed.code, 0, closed.output);
				assert.equal(closed.json.result, result);
				const assertion = run(root, ["--mode", "assert-yay", "--run", "run-1", "--review", "review-1", "--head-sha", sha("b"), "--proposal", file]);
				assert.notEqual(assertion.code, 0);
				assert.match(assertion.output, /not-approved/);
			} finally { rmSync(root, { recursive: true, force: true }); }
		}
	});
});
