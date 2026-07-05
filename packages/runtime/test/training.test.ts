import assert from "node:assert/strict";
import { afterEach, test } from "vitest";

import {
	applyTrainingArtifact,
	getAppliedArtifact,
	getTrainable,
	isTrainable,
	lintUseTrainingSource,
	listTrainables,
	resetTrainables,
	stub,
	TRAINABLE_METADATA,
	TrainingArtifactError,
	TrainingGroundingError,
	trainable,
	training,
} from "../src/index.js";

afterEach(() => {
	resetTrainables();
});

interface Ticket {
	readonly subject: string;
}
interface Classification {
	readonly category: string;
}

const CONTRACT = {
	ref: "contract://support/classification@1.0.0",
	invariants: ["output.category in KnownCategories"],
	forbiddenOutputs: ["rationale contains PII"],
	examples: [
		{
			input: { subject: "cannot reset password" },
			output: { category: "access" },
		},
		{
			input: { subject: "site is down" },
			output: { category: "outage" },
		},
	],
} as const;

const OPTIONS = {
	intent: "Route tickets; critical only for security/outage/prod impact.",
	contract: CONTRACT,
	rubric: { categoryCorrect: 0.92, piiSafe: 1.0 },
	params: { ticket: { description: "Support ticket, PII-redacted" } },
	output: { category: { description: "One of the known categories" } },
} as const;

function artifactFor(methodRef: string) {
	return {
		engineId: "hobo.training-engine/built-in-opto@0.1.0",
		engineVersion: "1.0.0",
		methodRef,
		programJson: JSON.stringify({
			instructions: "Classify the ticket into a known category.",
			demos: [
				{
					inputJson: JSON.stringify({ subject: "billing question" }),
					outputJson: JSON.stringify({ category: "billing" }),
				},
			],
		}),
	};
}

test("training(fn, opts) wraps a body baseline and records calls", async () => {
	const classify = training(
		async (t: Ticket): Promise<Classification> => ({
			category: t.subject.includes("down") ? "outage" : "other",
		}),
		{ ...OPTIONS, methodRef: "classifyTicket" },
	);

	assert.ok(isTrainable(classify));
	const result = await classify({ subject: "site is down" });
	assert.equal(result.category, "outage");

	const recorded = getTrainable("classifyTicket");
	assert.ok(recorded);
	assert.equal(recorded.calls.length, 1);
	assert.equal(recorded.calls[0]?.served, "body");
	assert.equal(recorded.fact.baseline, "body");
});

test("grounding is required at construction (ADR-0025 lint)", () => {
	assert.throws(
		() =>
			training(async (t: Ticket) => t, {
				intent: "",
				contract: CONTRACT,
				rubric: {},
				methodRef: "ungrounded",
			}),
		TrainingGroundingError,
	);
});

test("training.define serves the contract-derived stub baseline", async () => {
	const classify = training.define<Ticket, Classification>({
		...OPTIONS,
		methodRef: "defineClassify",
	});

	const matched = await classify({ subject: "cannot reset password" });
	assert.equal(matched.category, "access");

	const canned = await classify({ subject: "something unseen" });
	assert.equal(canned.category, "access"); // first example = canned response

	const recorded = getTrainable("defineClassify");
	assert.ok(recorded);
	assert.equal(recorded.fact.baseline, "stub");
	assert.deepEqual(
		recorded.calls.map((call) => call.served),
		["matched-example", "canned"],
	);
});

test("training.define requires examples for a servable empty implementation", () => {
	assert.throws(
		() =>
			training.define({
				...OPTIONS,
				contract: { ref: CONTRACT.ref },
				methodRef: "noExamples",
			}),
		TrainingGroundingError,
	);
});

test("training(stub(), opts) is the explicit-stub spelling of define", async () => {
	const classify = training(stub<Ticket, Classification>(), {
		...OPTIONS,
		methodRef: "stubClassify",
	});
	const result = await classify({ subject: "site is down" });
	assert.equal(result.category, "outage");
	assert.equal(getTrainable("stubClassify")?.fact.baseline, "stub");
});

test("applyTrainingArtifact attaches demos the stub serves (apply-at-load)", async () => {
	const classify = training.define<Ticket, Classification>({
		...OPTIONS,
		methodRef: "artifactClassify",
	});

	const before = await classify({ subject: "billing question" });
	assert.equal(before.category, "access"); // canned fallback pre-artifact

	applyTrainingArtifact(classify, artifactFor("artifactClassify"));
	assert.ok(getAppliedArtifact("artifactClassify"));

	const after = await classify({ subject: "billing question" });
	assert.equal(after.category, "billing"); // artifact demo now served

	// Reversible by dropping the artifact (ADR-0125).
	applyTrainingArtifact(classify, null);
	const reverted = await classify({ subject: "billing question" });
	assert.equal(reverted.category, "access");
});

test("applyTrainingArtifact accepts JSON strings and rejects mismatched methods", () => {
	training.define<Ticket, Classification>({
		...OPTIONS,
		methodRef: "target",
	});
	assert.throws(
		() => applyTrainingArtifact("target", artifactFor("someOtherMethod")),
		TrainingArtifactError,
	);
	const parsed = applyTrainingArtifact(
		"target",
		JSON.stringify(artifactFor("target")),
	);
	assert.equal(parsed?.methodRef, "target");
});

test("@trainable decorator lowers to identical manifest facts (ADR-0125 equivalence)", async () => {
	const wrapperForm = training(
		async (t: Ticket): Promise<Classification> => ({
			category: t.subject,
		}),
		{ ...OPTIONS, methodRef: "equivalent" },
	);
	await wrapperForm({ subject: "a" });
	const wrapperFact = getTrainable("equivalent")?.fact;
	resetTrainables();

	// Applied as `@trainable(...) classify(...)` in app code; invoked here as
	// a plain stage-3 decorator because this vitest execution path cannot
	// parse decorator syntax yet (Node-native transform). Same code path.
	class Support {
		async classify(t: Ticket): Promise<Classification> {
			return { category: t.subject };
		}
	}
	const metadata: Record<PropertyKey, unknown> = {};
	const context = {
		kind: "method",
		name: "classify",
		static: false,
		private: false,
		metadata,
		access: {
			get: (instance: Support) => instance.classify,
			has: () => true,
		},
		addInitializer: () => {},
	} as unknown as ClassMethodDecoratorContext<
		Support,
		(this: Support, input: Ticket) => Promise<Classification>
	>;
	const decorated = trainable<Support, Ticket, Classification>({
		...OPTIONS,
		methodRef: "equivalent",
	})(Support.prototype.classify, context);
	Support.prototype.classify = decorated;

	const support = new Support();
	const result = await support.classify({ subject: "a" });
	assert.equal(result.category, "a");
	const decoratorFact = getTrainable("equivalent")?.fact;

	assert.deepEqual(
		JSON.parse(JSON.stringify(decoratorFact)),
		JSON.parse(JSON.stringify(wrapperFact)),
	);
	assert.deepEqual(metadata[TRAINABLE_METADATA], ["equivalent"]);
});

test("listTrainables exposes manifest facts for collection", () => {
	training.define<Ticket, Classification>({
		...OPTIONS,
		methodRef: "listed",
	});
	const facts = listTrainables();
	assert.equal(facts.length, 1);
	assert.equal(facts[0]?.methodRef, "listed");
	assert.equal(facts[0]?.contractRef, CONTRACT.ref);
	assert.deepEqual(facts[0]?.rubric, OPTIONS.rubric);
});

test("lintUseTrainingSource flags missing groundings (promoted draft lint)", () => {
	const bad = lintUseTrainingSource(
		'export async function f() { "use training"; return 1; }',
	);
	assert.equal(bad.ok, false);
	assert.deepEqual(
		bad.findings.map((f) => f.kind),
		["intent", "contract", "rubric"],
	);

	const good = lintUseTrainingSource(
		`/** @intent classify */ export const f = training(async () => 1, { intent: "x", contract: C, rubric: { a: 1 } }); // "use training"`,
	);
	assert.equal(good.ok, true);
});
