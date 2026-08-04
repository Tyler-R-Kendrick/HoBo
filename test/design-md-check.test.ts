import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vitest";

import {
	hasWebFramework,
	listWebUiProjects,
	runDesignMdCheck,
	WEB_UI_ROOTS,
} from "../scripts/check-design-md.mts";
import { selectRelevantChecks } from "../scripts/relevant-check-policy.js";

test("WEB_UI_ROOTS includes site", () => {
	assert.ok(WEB_UI_ROOTS.includes("site"));
});

test("hasWebFramework detects astro", () => {
	assert.equal(hasWebFramework({ dependencies: { astro: "^5.0.0" } }), true);
	assert.equal(hasWebFramework({ dependencies: { vitest: "^3.0.0" } }), false);
});

test("listWebUiProjects finds site DESIGN.md on real repo", () => {
	const projects = listWebUiProjects();
	const site = projects.find((p) => p.rel === "site");
	assert.ok(site, "site must be discovered as web UI");
	assert.ok(site.designMd?.endsWith("site/DESIGN.md"));
});

// designmd binary startup is slow on cold CI runners; allow more than 5s.
test("runDesignMdCheck passes on real site DESIGN.md", {
	timeout: 120_000,
}, () => {
	const { ok, results, projects } = runDesignMdCheck();
	assert.ok(projects.length >= 1);
	assert.equal(ok, true, JSON.stringify(results, null, 2));
	assert.ok(results.every((r) => r.ok && !r.missing));
});

test("listWebUiProjects requires DESIGN.md for hobo.webUi packages", async () => {
	const root = await mkdtemp(path.join(tmpdir(), "hobo-design-md-"));
	await mkdir(path.join(root, "site"), { recursive: true });
	await writeFile(
		path.join(root, "site", "package.json"),
		JSON.stringify({ name: "fake-site", hobo: { webUi: true } }),
	);
	// no DESIGN.md
	const projects = listWebUiProjects(root);
	const site = projects.find((p) => p.rel === "site");
	assert.ok(site);
	assert.equal(site.designMd, null);
	const { ok, results } = runDesignMdCheck(root);
	assert.equal(ok, false);
	assert.ok(results.some((r) => r.missing));
});

test("relevant-check policy selects design:lint for site CSS and DESIGN.md", () => {
	const css = selectRelevantChecks({
		files: ["site/src/styles/global.css"],
		base: "origin/main",
	});
	assert.ok(
		css.checks.some(
			(c) => c.command === "pnpm" && c.args.join(" ") === "run design:lint",
		),
		`expected design:lint for css, got ${css.checks.map((c) => c.args.join(" ")).join(" | ")}`,
	);

	const design = selectRelevantChecks({
		files: ["site/DESIGN.md"],
		base: "origin/main",
	});
	assert.ok(
		design.checks.some(
			(c) => c.command === "pnpm" && c.args.join(" ") === "run design:lint",
		),
	);

	const backend = selectRelevantChecks({
		files: ["packages/core/src/index.ts"],
		base: "origin/main",
	});
	assert.ok(
		!backend.checks.some(
			(c) => c.command === "pnpm" && c.args.join(" ") === "run design:lint",
		),
		"core package changes should not force design:lint",
	);
});
