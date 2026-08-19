/**
 * Cucumber step bindings for OptimizeXP feature `hobo-code-cli-intuitive-feedback`.
 * Thin adapters → implementations.ts (keeps Gherkin text stable).
 */
import { Given, Then, When } from "@cucumber/cucumber";
import {
	assertClearStatus,
	assertErrorActionable,
	assertNextActionObvious,
	exerciseSurface,
	markEvidenceCapturable,
	observeFailure,
	onCriticalPath,
	setFeatureContext,
	setPersona,
} from "./implementations.ts";
import { createWorld, type OptimizexpWorld } from "./world.ts";

// Cucumber World — attach helpers on `this`
function w(world: OptimizexpWorld | undefined): OptimizexpWorld {
	// cucumber may use World class; fall back to module singleton for simple runs
	return world ?? getSingleton();
}

let singleton: OptimizexpWorld | null = null;
function getSingleton(): OptimizexpWorld {
	singleton ??= createWorld("hobo-code-cli-intuitive-feedback");
	return singleton;
}

Given(
	"persona {string} is active",
	function (this: OptimizexpWorld, personaId: string) {
		const world = this?.featureId ? this : getSingleton();
		if (!world.featureId)
			Object.assign(world, createWorld("hobo-code-cli-intuitive-feedback"));
		setPersona(world, personaId);
	},
);

Given(
	"feature {string} is under optimizexp review",
	function (this: OptimizexpWorld, featureId: string) {
		const world = this?.featureId ? this : getSingleton();
		setFeatureContext(world, featureId);
	},
);

Given(
	"I am on the critical path described by the feature seed",
	function (this: OptimizexpWorld) {
		onCriticalPath(w(this));
	},
);

Given("something goes wrong on this journey", function (this: OptimizexpWorld) {
	const world = w(this);
	world.notes.push("failure path primed");
});

When(
	"I exercise the surface as this persona would",
	function (this: OptimizexpWorld) {
		exerciseSurface(w(this));
	},
);

When("I observe the failure as this persona", function (this: OptimizexpWorld) {
	observeFailure(w(this));
});

Then(
	"I receive clear status about what happened",
	function (this: OptimizexpWorld) {
		assertClearStatus(w(this));
	},
);

Then(
	"the next action is obvious without tribal knowledge",
	function (this: OptimizexpWorld) {
		assertNextActionObvious(w(this));
	},
);

Then(
	"evidence is capturable for this scenario",
	function (this: OptimizexpWorld) {
		markEvidenceCapturable(w(this));
	},
);

Then(
	"the error is non-blaming and actionable",
	function (this: OptimizexpWorld) {
		assertErrorActionable(w(this));
	},
);

Then(
	"I am not forced into repeated artificial hurdles",
	function (this: OptimizexpWorld) {
		// Structural: a single command attempt is enough for scaffold; agent refines.
		const world = w(this);
		if (world.notes.filter((n) => n.includes("exerciseSurface")).length > 3) {
			throw new Error("too many exercise attempts — friction signal");
		}
	},
);

// re-export for tests
export { createWorld, getSingleton };
