import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	applyInContextEdit,
	assertEvidenceTripleComplete,
	assertNoVendoredTokenTools,
	buildMultiplexerStatus,
	cleanupIsolation,
	copyOnHighlight,
	createBudgetTracker,
	createHarnessCore,
	createIsolationContext,
	createOpenUiSession,
	createPane,
	demonstrateDurability,
	describeDevTerminalAttach,
	dogfoodSummary,
	emitEvidenceTriple,
	HOBO_CODE_PACKAGE,
	herdrMuxCapabilities,
	ISOLATION_PLATFORM_MATRIX,
	linkGherkinToOpenFeature,
	listSandboxOrphans,
	lockVisualArtifact,
	measureTemplateSuccessRate,
	parseEvidenceTriple,
	parseIsolationContext,
	parsePromotionRequest,
	promoteIsolation,
	registerCodeNamedEndpoint,
	renderHerdrCapabilityFooter,
	renderStatusText,
	resetIsolationRegistry,
	routeProvider,
	runRhaiSubset,
	scaffoldHighValueTemplate,
	sponsoredWaitState,
	startCodeSession,
	tsAutocodeConventions,
	validateLockedVisual,
} from "../src/index.js";

const temps: string[] = [];
afterEach(() => {
	resetIsolationRegistry();
	for (const d of temps) rmSync(d, { recursive: true, force: true });
	temps.length = 0;
});

function tempDir(prefix: string): string {
	const d = mkdtempSync(join(tmpdir(), prefix));
	temps.push(d);
	return d;
}

describe("@hobo/code", () => {
	it("exports package id", () => {
		expect(HOBO_CODE_PACKAGE).toBe("@hobo/code");
	});

	it("parse boundaries reject invalid isolation/promotion/evidence", () => {
		expect(() => parseIsolationContext(null)).toThrow(/object/);
		expect(() => parsePromotionRequest({ squashOnly: false })).toThrow(
			/squashOnly/,
		);
		expect(() => parseEvidenceTriple({ schemaVersion: "nope" })).toThrow();
	});

	it("isolation creates worktree fallback and cleans with zero orphans", async () => {
		const home = tempDir("hobo-code-home-");
		const project = tempDir("hobo-code-proj-");
		mkdirSync(join(project, "src"), { recursive: true });
		writeFileSync(join(project, "README.md"), "proj\n");

		const ctx = await createIsolationContext({
			projectRoot: project,
			hoboHome: home,
			runId: "run-clean",
			forceWorktree: true,
			stationId: "station:local",
		});
		expect(ctx.schemaVersion).toBe("hobo.code.isolation/v1");
		expect(ctx.backend.kind).toBe("worktree");
		expect(ctx.mediatedOnly).toBe(true);
		expect(existsSync(ctx.rootPath)).toBe(true);
		expect(existsSync(ctx.durableRoot)).toBe(true);

		const cleaned = await cleanupIsolation("run-clean", {
			hoboHome: home,
			ok: true,
			gates: ["architecture:guard:pass"],
		});
		expect(cleaned.status).toBe("cleaned");
		expect(cleaned.orphans).toEqual([]);
		expect(listSandboxOrphans(home)).toEqual([]);
		expect(existsSync(ctx.durableRoot)).toBe(true);
		expect(cleaned.handback.ok).toBe(true);
	});

	it("cleanup on cancel still leaves zero orphans", async () => {
		const home = tempDir("hobo-code-cancel-");
		const project = tempDir("hobo-code-proj2-");
		const ctx = await createIsolationContext({
			projectRoot: project,
			hoboHome: home,
			runId: "run-cancel",
			forceWorktree: true,
		});
		expect(existsSync(ctx.rootPath)).toBe(true);
		const cleaned = await cleanupIsolation("run-cancel", {
			hoboHome: home,
			ok: false,
			gates: ["cancelled"],
		});
		expect(cleaned.orphans).toEqual([]);
		expect(listSandboxOrphans(home)).toEqual([]);
	});

	it("platform matrix covers win32 and CoW platforms", () => {
		expect(ISOLATION_PLATFORM_MATRIX.some((r) => r.platform === "win32")).toBe(
			true,
		);
		expect(
			ISOLATION_PLATFORM_MATRIX.find((r) => r.platform === "win32")
				?.preferredBackend,
		).toBe("worktree");
		expect(
			ISOLATION_PLATFORM_MATRIX.find((r) => r.platform === "darwin-apfs")
				?.preferredBackend,
		).toBe("rift");
	});

	it("promotion is gated, squash-only, and cleans isolation", async () => {
		const home = tempDir("hobo-code-promo-");
		const project = tempDir("hobo-code-proj3-");
		const ctx = await createIsolationContext({
			projectRoot: project,
			hoboHome: home,
			runId: "run-promo",
			forceWorktree: true,
		});
		const refused = await promoteIsolation(
			{
				runId: "run-promo",
				isolationRoot: ctx.rootPath,
				targetProject: project,
				gateResults: [],
				squashOnly: true,
			},
			{
				hoboHome: home,
				gates: [{ name: "architecture:guard", pass: false, detail: "fail" }],
			},
		);
		expect(refused.ok).toBe(false);
		expect(refused.code).toBe("HOBO_CODE_PROMOTE_GATES_FAILED");

		const ok = await promoteIsolation(
			{
				runId: "run-promo",
				isolationRoot: ctx.rootPath,
				targetProject: project,
				gateResults: [],
				squashOnly: true,
			},
			{
				hoboHome: home,
				gates: [
					{ name: "architecture:guard", pass: true, detail: "ok" },
					{ name: "standards:check", pass: true, detail: "ok" },
					{ name: "agent:check", pass: true, detail: "ok" },
					{ name: "docs:freshness", pass: true, detail: "ok" },
				],
			},
		);
		expect(ok.ok).toBe(true);
		expect(ok.code).toBe("HOBO_CODE_PROMOTED");
		expect(ok.cleaned).toBe(true);
		expect(listSandboxOrphans(home)).toEqual([]);
	});

	it("harness loads skills, runs rhai workflow, survives restart", () => {
		const world = tempDir("hobo-code-world-");
		const harness = createHarnessCore({ worldRoot: world });
		const skills = harness.listSkills();
		expect(skills.map((s) => s.name)).toContain("repo");
		expect(skills.map((s) => s.name)).toContain("ponytail");

		const wf = harness.runRhaiWorkflow(`
// simple workflow
step "load-skills"
log "hello"
assert true
step "done"
`);
		expect(wf.ok).toBe(true);
		expect(wf.steps).toEqual(["load-skills", "done"]);

		const { before, after } = demonstrateDurability(harness, "dur-1");
		expect(after.checkpoint).toBe(before.checkpoint);
		expect(after.survivingRestart).toBe(true);
		expect(harness.exposeMcp().protocol).toBe("mcp");
		expect(harness.exposeMcp().tools).toContain("hobo.code.isolation");
	});

	it("rhai subset rejects unsupported statements", () => {
		const bad = runRhaiSubset(`fn evil() {}`);
		expect(bad.ok).toBe(false);
	});

	it("scaffolds high-value template with OpenFeature + Gherkin + conventions", () => {
		const out = tempDir("hobo-code-scaffold-");
		const result = scaffoldHighValueTemplate({
			outputDir: out,
			appName: "demo",
		});
		expect(result.templateId).toBe("openui-astryx-bindle");
		expect(result.openFeatureFlag).toBe("app.visual.primary");
		expect(result.gherkinFeature).toBe("features/visual.feature");
		expect(result.respectsKonsistent).toBe(true);
		expect(result.respectsGenerated).toBe(true);
		expect(existsSync(join(out, "features/visual.feature"))).toBe(true);
		expect(existsSync(join(out, "src/_generated"))).toBe(true);
		expect(existsSync(join(out, "hobo.scaffold.json"))).toBe(true);
		expect(existsSync(join(out, "public/index.html"))).toBe(true);
		expect(existsSync(join(out, "public/styles.css"))).toBe(true);

		const conventions = tsAutocodeConventions();
		expect(conventions.konsistent).toBe(true);
		expect(conventions.generatedDir).toBe("src/_generated");

		const rate = measureTemplateSuccessRate([
			{ success: true },
			{ success: true },
			{ success: false },
		]);
		expect(rate.rate).toBeCloseTo(2 / 3);
	});

	it("emits full evidence triple for passing Gherkin+OpenFeature scenario", () => {
		const durable = tempDir("hobo-code-ev-");
		const link = linkGherkinToOpenFeature(
			"Primary surface renders and is lockable",
			"app.visual.primary",
		);
		expect(link.linked).toBe(true);
		const triple = emitEvidenceTriple({
			durableRoot: durable,
			flagKey: link.flagKey,
			scenario: link.scenario,
			passed: true,
		});
		expect(assertEvidenceTripleComplete(triple)).toBe(true);
		expect(existsSync(triple.playwrightScriptPath)).toBe(true);
		expect(existsSync(triple.recordingMp4Path)).toBe(true);
		expect(triple.screenshotPaths.length).toBeGreaterThan(0);
	});

	it("OpenUI generate → edit → lock → agent browser validate", () => {
		const durable = tempDir("hobo-code-vis-");
		let session = createOpenUiSession({
			durableRoot: durable,
			prompt: "Todo board",
		});
		expect(session.html).toContain('data-testid="primary"');
		expect(session.html).toContain("hobo-code");
		expect(session.html).not.toContain("hobo-code · openui");
		session = applyInContextEdit(session, "ready");
		expect(session.html).toContain("ready");
		const locked = lockVisualArtifact(session);
		expect(locked.immutable).toBe(true);
		expect(locked.edits).toContain("ready");
		const validation = validateLockedVisual(locked);
		expect(validation.ok).toBe(true);
		expect(validation.hasPrimary).toBe(true);
		expect(validation.hasBadge).toBe(true);
		expect(() =>
			applyInContextEdit({ ...session, locked: true }, "nope"),
		).toThrow(/immutable/);
	});

	it("TUI status observes agent state and supports copy-on-highlight", () => {
		let pane = createPane("agent-1", "working", "scaffolding");
		pane = copyOnHighlight(pane, "selected snippet");
		expect(pane.highlightBuffer).toBe("selected snippet");
		const status = buildMultiplexerStatus([pane], {
			remoteReady: true,
			theme: "herdr",
		});
		expect(status.copyOnHighlight).toBe(true);
		const caps = herdrMuxCapabilities("herdr");
		expect(caps.copyOnHighlight).toBe(true);
		expect(caps.detachable).toBe(true);
		expect(renderHerdrCapabilityFooter(caps)).toMatch(/highlight→copy/);
		expect(status.clickableRegions).toContain("agent-state-badge");
		expect(status.panes[0]?.semanticState).toBe("working");
		const text = renderStatusText(status);
		expect(text).toContain("hobo-code");
		expect(text).toContain("●");
		expect(text).toContain("agent-1");
		// clipboard folds onto pane row as ↳snippet (may truncate)
		expect(text).toMatch(/↳selected/);
		expect(text).not.toContain("clipboard ·");
	});

	it("registers deterministic named endpoint and documents mosh", () => {
		const reg = registerCodeNamedEndpoint({
			mode: "local",
			project: "demo",
			branch: "main",
		});
		expect(reg.resource).toBe("code");
		expect(reg.host.includes("code")).toBe(true);
		expect(reg.host.endsWith(".hobo")).toBe(false);
		expect(reg.url.includes("://")).toBe(true);
		expect(reg.mosh.explored).toBe(true);
		const surface = describeDevTerminalAttach({ mode: "local" });
		expect(surface.attach.detachable).toBe(true);
		expect(surface.compare.tmux).toMatch(/tmux/i);
		expect(surface.legend).toMatch(/attach/);
	});

	it("budget is visible; monetization ON by default and never inspects code", () => {
		const tracker = createBudgetTracker();
		expect(tracker.isMonetizationEnabled()).toBe(true);
		tracker.record({ provider: "codex", usd: 0.12 });
		const snap = tracker.snapshot("codex");
		expect(snap.spendUsd).toBeCloseTo(0.12);
		expect(snap.monetizationEnabled).toBe(true);
		const wait = sponsoredWaitState({ enabled: true, slot: "wait" });
		expect(wait.shown).toBe(true);
		expect(wait.inspectsCode).toBe(false);
		expect(wait.inspectsPrompts).toBe(false);
		const routed = routeProvider(
			[
				{ provider: "cheap", costUsd: 0.01, capable: true },
				{ provider: "dear", costUsd: 1, capable: true },
			],
			{
				capUsd: 5,
				routingPolicy: "cheapest-capable",
				monetizationOptIn: false,
			},
		);
		expect(routed).toBe("cheap");
	});

	it("token tools are not vendored into project workspace", () => {
		const project = tempDir("hobo-code-tools-");
		const check = assertNoVendoredTokenTools(project);
		expect(check.ok).toBe(true);
		expect(check.found).toEqual([]);
	});

	it("dogfoods stations, trails, cq, finops, openfeature, harness, connectivity", () => {
		const summary = dogfoodSummary("station:local");
		expect(summary.stations.isolationBoundary).toBe("station");
		expect(summary.trails.length).toBeGreaterThan(0);
		expect(summary.cq.localMcpMandatory).toBe(true);
		expect(summary.finops).toBe(true);
		expect(summary.openFeature).toBe(true);
		expect(summary.harness).toBe(true);
		expect(summary.connectivity).toBe(true);
	});

	it("startCodeSession wires isolation + status + cleanup", async () => {
		const home = tempDir("hobo-code-sess-");
		const project = tempDir("hobo-code-sess-proj-");
		const session = await startCodeSession({
			projectRoot: project,
			hoboHome: home,
			stationId: "station:local",
		});
		session.setAgentState("worker", "working", "editing");
		const status = session.status();
		expect(status.panes.some((p) => p.agentId === "worker")).toBe(true);
		expect(session.harness.listSkills().length).toBeGreaterThan(0);
		expect(session.remote.resource).toBe("code");
		const handback = await session.complete(true, ["agent:check:pass"]);
		expect(handback.isolationStatus).toBe("cleaned");
		expect(listSandboxOrphans(home)).toEqual([]);
	});
});
