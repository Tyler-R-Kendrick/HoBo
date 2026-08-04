/**
 * Cucumber step bindings for hobo-code-cost-zero.
 */
import { Given, Then, When } from "@cucumber/cucumber";
import {
  assertClearStatus,
  assertCostJsonReadable,
  assertErrorActionable,
  assertHelpNamesCost,
  assertNextActionObvious,
  exerciseSurface,
  markEvidenceCapturable,
  observeCostJson,
  observeFailure,
  onCriticalPath,
  readCostHelp,
  setFeatureContext,
  setPersona,
} from "./implementations.ts";
import { createWorld, type OptimizexpWorld } from "./world.ts";

function w(world: OptimizexpWorld | undefined): OptimizexpWorld {
  return world ?? getSingleton();
}

let singleton: OptimizexpWorld | null = null;
function getSingleton(): OptimizexpWorld {
  singleton ??= createWorld("hobo-code-cost-zero");
  return singleton;
}

Given("persona {string} is active", function (this: OptimizexpWorld, personaId: string) {
  const world = this?.featureId ? this : getSingleton();
  if (!world.featureId) Object.assign(world, createWorld("hobo-code-cost-zero"));
  setPersona(world, personaId);
});

Given(
  "feature {string} is under optimizexp review",
  function (this: OptimizexpWorld, featureId: string) {
    setFeatureContext(this?.featureId ? this : getSingleton(), featureId);
  },
);

Given(
  "I am on the critical path described by the feature seed",
  function (this: OptimizexpWorld) {
    onCriticalPath(w(this));
  },
);

Given("something goes wrong on this journey", function (this: OptimizexpWorld) {
  w(this).notes.push("failure primed");
});

When("I exercise the surface as this persona would", function (this: OptimizexpWorld) {
  exerciseSurface(w(this));
});

When("I observe the failure as this persona", function (this: OptimizexpWorld) {
  observeFailure(w(this));
});

When("I observe cost JSON as this persona", function (this: OptimizexpWorld) {
  observeCostJson(w(this));
});

When("I read cost help as this persona", function (this: OptimizexpWorld) {
  readCostHelp(w(this));
});

Then("I receive clear status about what happened", function (this: OptimizexpWorld) {
  assertClearStatus(w(this));
});

Then(
  "the next action is obvious without tribal knowledge",
  function (this: OptimizexpWorld) {
    assertNextActionObvious(w(this));
  },
);

Then("cost free local and savings are machine-readable", function (this: OptimizexpWorld) {
  assertCostJsonReadable(w(this));
});

Then("help names cost and free local", function (this: OptimizexpWorld) {
  assertHelpNamesCost(w(this));
});

Then("evidence is capturable for this scenario", function (this: OptimizexpWorld) {
  markEvidenceCapturable(w(this));
});

Then("the error is non-blaming and actionable", function (this: OptimizexpWorld) {
  assertErrorActionable(w(this));
});

Then(
  "I am not forced into repeated artificial hurdles",
  function (this: OptimizexpWorld) {
    const world = w(this);
    if (world.notes.filter((n) => n.includes("exerciseSurface")).length > 3) {
      throw new Error("too many exercise attempts");
    }
  },
);

export { createWorld, getSingleton };
