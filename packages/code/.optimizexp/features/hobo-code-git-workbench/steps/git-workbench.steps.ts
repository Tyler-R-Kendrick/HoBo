import { readFileSync } from "node:fs";

import { Given, Then } from "@cucumber/cucumber";
import { expect } from "vitest";

const source = readFileSync(
	new URL("../../../../src/session-control-server.ts", import.meta.url),
	"utf8",
);
const terminalSource = readFileSync(
	new URL("../../../../src/git-terminal-pane.ts", import.meta.url),
	"utf8",
);
const sessionSource = readFileSync(
	new URL("../../../../src/resident-session-cli.ts", import.meta.url),
	"utf8",
);

Given(
	"hobo-code session serve exposes the resident session control surface",
	() => {
		expect(source).toContain("function gitWorkbench(s)");
	},
);

Then("the surface exposes a Git tab beside resident terminal tabs", () => {
	expect(source).toContain("tabs.append(gitTab)");
	expect(source).toContain("select-git-tab");
});

Then(
	"the Git tab exposes Status, Files, Branches, Commits, Stash, and Preview panels",
	() => {
		for (const panel of [
			"Status",
			"Files",
			"Branches",
			"Commits",
			"Stash",
			"Preview",
		])
			expect(source).toContain(`'${panel}'`);
	},
);

Then("keys 1 through 5 focus Git panels", () => {
	expect(source).toContain("/^[1-5]$/u.test(e.key)");
});

Then("arrows or j and k move the Git selection", () => {
	expect(source).toContain("['ArrowDown','j','ArrowUp','k']");
});

Then("Space stages or unstages the selected whole file", () => {
	expect(source).toContain("toggleGitFile(s)");
	expect(source).toContain("unstage?'unstagePaths':'stagePaths'");
});

Then("files can be discarded or ignored", () => {
	expect(source).toContain("'git-discard'");
	expect(source).toContain("'git-ignore'");
});

Then("branches and stashes can be managed", () => {
	for (const action of [
		"git-checkout",
		"git-new-branch",
		"git-delete-branch",
		"git-stash-create",
		"git-stash-apply",
		"git-stash-pop",
		"git-stash-drop",
	])
		expect(source).toContain(`'${action}'`);
});

Then("repository sync and commit revert are available", () => {
	expect(source).toContain("'git-fetch'");
	expect(source).toContain("'git-pull'");
	expect(source).toContain("'git-revert'");
});

Then("commits contain staged changes only", () => {
	expect(source).toContain("stagedOnly:true");
});

Then("commit shows the exact staged effect before approval", () => {
	expect(source).toContain("Exact effect:");
	expect(source).toContain("'git-commit'");
});

Then("attaching ensures a native Git tmux window", () => {
	expect(sessionSource).toContain('"Git"');
	expect(sessionSource).toContain('"git",');
	expect(sessionSource).toContain("ensureGitPane");
});

Then("the native Git window exposes all five panels at 80 by 24", () => {
	for (const panel of [
		"1 Status",
		"2 Files",
		"3 Branches",
		"4 Commits",
		"5 Stash",
	])
		expect(terminalSource).toContain(panel);
	expect(terminalSource).toContain("columns = 80");
	expect(terminalSource).toContain("rows = 24");
});

Then("native delivery actions require typed approval", () => {
	expect(terminalSource).toContain("type yes to approve");
	for (const command of [
		"commit",
		"push",
		"openPullRequest",
		"stackPullRequest",
		"mergePullRequest",
	])
		expect(terminalSource).toContain(`"${command}"`);
});

Then("the diff appears before the Git side panels on a narrow viewport", () => {
	expect(source).toContain(".git-main{order:-1}");
});

Then("every delivery action remains keyboard reachable", () => {
	expect(source).toContain("workbench.onkeydown");
	expect(source).toContain("commit.click()");
});
