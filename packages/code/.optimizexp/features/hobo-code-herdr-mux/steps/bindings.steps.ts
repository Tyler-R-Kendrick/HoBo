import { After, Before, Given, Then, When } from "@cucumber/cucumber";
import {
	assertActionableMissingSession,
	assertCurrentSessionHelp,
	assertDetachHelp,
	assertScenarioEvidenceExists,
	assertStationExplanation,
	cleanup,
	exerciseBrowserControls,
	openBrowserJourney,
	runCurrentCli,
	startBrowserJourney,
} from "./implementations.ts";
import { createWorld, type OptimizexpWorld } from "./world.ts";

Before(function (this: OptimizexpWorld, scenario) {
	Object.assign(this, createWorld());
	this.scenarioName = scenario.pickle.name;
});

After(async function (this: OptimizexpWorld) {
	await cleanup(this);
});

Given(
	"persona {string} is active",
	function (this: OptimizexpWorld, personaId: string) {
		this.personaId = personaId;
	},
);

Given(
	"feature {string} is under optimizexp review",
	function (this: OptimizexpWorld, featureId: string) {
		this.featureId = featureId;
	},
);

Given("I am on the critical path described by the feature seed", () => {});
Given("something goes wrong on this journey", () => {});

When(
	/^I run `pnpm --filter @hobo\/code exec node --import tsx src\/bin\/hobo-code\.ts session --help`$/u,
	function (this: OptimizexpWorld) {
		runCurrentCli(this, ["session", "--help"]);
	},
);

Then(
	"I see resident session, tab, pane, agent, checkpoint, delivery, and browser controls",
	function (this: OptimizexpWorld) {
		assertCurrentSessionHelp(this);
	},
);

Then(
	"detach and reattach are explicit without tribal knowledge",
	function (this: OptimizexpWorld) {
		assertDetachHelp(this);
	},
);

When(
	"I run `hobo-code session show missing-session`",
	function (this: OptimizexpWorld) {
		runCurrentCli(this, ["session", "show", "missing-session"]);
	},
);

Then(
	"the error is non-blaming and actionable",
	function (this: OptimizexpWorld) {
		assertActionableMissingSession(this);
	},
);

Given(
	"the loopback session control server is running with its bearer token",
	async function (this: OptimizexpWorld) {
		await startBrowserJourney(this);
	},
);

When(
	"I open its authenticated browser URL",
	async function (this: OptimizexpWorld) {
		await openBrowserJourney(this);
	},
);

Then(
	"I can create, list, reattach, detach, stop, focus, and prompt resident sessions",
	async function (this: OptimizexpWorld) {
		await exerciseBrowserControls(this);
	},
);

Then(
	"the page explains remote access through Station forwarding without binding publicly",
	function (this: OptimizexpWorld) {
		assertStationExplanation(this);
	},
);

Then(
	"evidence is capturable for this scenario",
	function (this: OptimizexpWorld) {
		assertScenarioEvidenceExists(this);
	},
);

Then(
	/^evidence of what I saw is stored under evidence\/$/u,
	function (this: OptimizexpWorld) {
		assertScenarioEvidenceExists(this);
	},
);
