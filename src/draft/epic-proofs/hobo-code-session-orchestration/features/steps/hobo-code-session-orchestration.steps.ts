import { strict as assert } from "node:assert";
import { Given, Then } from "@cucumber/cucumber";
import { parseRequiredSessionCommands } from "../../src/session-command-suite.js";

let parsed: readonly string[] = [];

Given("the HoBo Code resident session command suite", function () {
  parsed = parseRequiredSessionCommands();
});

Then("all {int} resident session lifecycle commands are accepted", function (count: number) {
  assert.equal(parsed.length, count);
});

Then("detach and reattach remain explicit session operations", function () {
  assert(parsed.includes("detachSession"));
  assert(parsed.includes("reattachSession"));
  assert(parsed.includes("stopSession"));
});
