/**
 * Cucumber step bindings for hobo-code-claude-guide.
 */
import { Given, Then, When } from "@cucumber/cucumber";
import {
  assertClaudeMapReadable,
  assertClearStatus,
  assertErrorActionable,
  assertHelpNamesClaudeGuide,
  assertNextActionObvious,
  exerciseSurface,
  markEvidenceCapturable,
  observeFailure,
  observeGuideJson,
  onCriticalPath,
  readClaudeGuideHelp,
  setFeatureContext,
  setPersona,
} from "./implementations.ts";
import { createWorld, type OptimizexpWorld } from "./world.ts";

function w(world: OptimizexpWorld | undefined): OptimizexpWorld {
  return world ?? getSingleton();
}

let singleton: OptimizexpWorld | null = null;
function getSingleton(): OptimizexpWorld {
  singleton ??= createWorld("hobo-code-claude-guide");
  return singleton;
}

Given("persona {string} is active", function (this: OptimizexpWorld, personaId: string) {
  const world = this?.featureId ? this : getSingleton();
  if (!world.featureId) Object.assign(world, createWorld("hobo-code-claude-guide"));
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

When("I observe guide JSON as this persona", function (this: OptimizexpWorld) {
  observeGuideJson(w(this));
});

When("I read claude guide help as this persona", function (this: OptimizexpWorld) {
  readClaudeGuideHelp(w(this));
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

Then("claude code map is machine-readable", function (this: OptimizexpWorld) {
  assertClaudeMapReadable(w(this));
});

Then("help names Claude Code and guide", function (this: OptimizexpWorld) {
  assertHelpNamesClaudeGuide(w(this));
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
