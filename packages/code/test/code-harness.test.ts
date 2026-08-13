import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
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
	parseGuestEvidenceSubmission,
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
import { parseSkillName } from "../src/harness.js";

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
		expect(() =>
			parseGuestEvidenceSubmission({
				kind: "test",
				title: "unit suite",
				summary: "passed",
				subject: "packages/code",
				artifactRefs: [],
				verification: "verified",
			}),
		).toThrow(/host-owned/);
	});

	it("parses guest evidence without granting host trust", () => {
		const submission = parseGuestEvidenceSubmission({
			kind: "screenshot",
			title: "session overview",
			summary: "developer-visible capture",
			subject: "session:demo",
			artifactRefs: [
				"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			],
			sourceRef: "scenario:overview",
		});

		expect(submission).toEqual({
			kind: "screenshot",
			title: "session overview",
			summary: "developer-visible capture",
			subject: "session:demo",
			artifactRefs: [
				"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			],
			sourceRef: "scenario:overview",
		});
		expect(Object.isFrozen(submission)).toBe(true);
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

	it("does not silently replace a failed git worktree with an empty sandbox", async () => {
		const home = tempDir("hobo-code-fail-closed-home-");
		const project = tempDir("hobo-code-fail-closed-project-");
		spawnSync("git", ["init", "-q", "-b", "main"], { cwd: project });
		spawnSync("git", ["config", "user.email", "t@example.com"], {
			cwd: project,
		});
		spawnSync("git", ["config", "user.name", "t"], { cwd: project });
		writeFileSync(join(project, "README.md"), "base\n");
		spawnSync("git", ["add", "-A"], { cwd: project });
		spawnSync("git", ["commit", "-qm", "base"], { cwd: project });
		spawnSync("git", ["branch", "code/already-there"], { cwd: project });

		await expect(
			createIsolationContext({
				projectRoot: project,
				hoboHome: home,
				runId: "collision",
				branch: "code/already-there",
				forceWorktree: true,
			}),
		).rejects.toThrow("git worktree add failed");
		expect(
			existsSync(join(home, "sandboxes/collision/.hobo-mediated-view.json")),
		).toBe(false);
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

	it("promotion is gated, applies the work, and only then cleans up", async () => {
		const home = tempDir("hobo-code-promo-");
		const project = tempDir("hobo-code-proj3-");
		// A real git project is required: promotion carries a diff across.
		spawnSync("git", ["init", "-q", "-b", "main"], { cwd: project });
		spawnSync("git", ["config", "user.email", "t@example.com"], {
			cwd: project,
		});
		spawnSync("git", ["config", "user.name", "t"], { cwd: project });
		writeFileSync(join(project, "README.md"), "base\n");
		spawnSync("git", ["add", "-A"], { cwd: project });
		spawnSync("git", ["commit", "-qm", "base"], { cwd: project });

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
		// A refused promotion must never destroy the sandbox.
		expect(existsSync(ctx.rootPath)).toBe(true);

		const passing = [
			{ name: "architecture:guard", pass: true, detail: "ok" },
			{ name: "standards:check", pass: true, detail: "ok" },
			{ name: "agent:check", pass: true, detail: "ok" },
			{ name: "docs:freshness", pass: true, detail: "ok" },
		];

		// Nothing changed in the sandbox → promotion fails closed and, above
		// all, does not delete the sandbox while claiming success.
		const empty = await promoteIsolation(
			{
				runId: "run-promo",
				isolationRoot: ctx.rootPath,
				targetProject: project,
				gateResults: [],
				squashOnly: true,
			},
			{ hoboHome: home, gates: passing },
		);
		expect(empty.ok).toBe(false);
		expect(empty.code).toBe("HOBO_CODE_PROMOTE_NOTHING_TO_APPLY");
		expect(existsSync(ctx.rootPath)).toBe(true);

		// Now do real work in the sandbox: an edit and a new file.
		writeFileSync(join(ctx.rootPath, "README.md"), "base\nfrom the agent\n");
		writeFileSync(join(ctx.rootPath, "added.ts"), "export const x = 1;\n");

		const ok = await promoteIsolation(
			{
				runId: "run-promo",
				isolationRoot: ctx.rootPath,
				targetProject: project,
				gateResults: [],
				squashOnly: true,
			},
			{ hoboHome: home, gates: passing },
		);
		expect(ok.ok).toBe(true);
		expect(ok.code).toBe("HOBO_CODE_PROMOTED");
		// The whole point: the work is actually in the project now.
		expect(readFileSync(join(project, "README.md"), "utf8")).toContain(
			"from the agent",
		);
		expect(existsSync(join(project, "added.ts"))).toBe(true);
		// Staged for review, not committed behind the user's back.
		const status = spawnSync("git", ["status", "--porcelain"], {
			cwd: project,
			encoding: "utf8",
		});
		expect(status.stdout).toMatch(/added\.ts/);
		// Only after a successful apply is the sandbox reclaimed.
		expect(ok.cleaned).toBe(true);
		expect(listSandboxOrphans(home)).toEqual([]);
	});

	it("harness loads skills, runs rhai workflow, survives restart", () => {
		const world = tempDir("hobo-code-world-");
		const harness = createHarnessCore({ worldRoot: world });
		const skills = harness.listSkills();
		expect(skills.map((s) => s.name)).toContain("repo");
		expect(skills.map((s) => s.name)).toContain("impeccable");
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

	it("loads generated recording skills only from the project recording root", () => {
		const project = tempDir("hobo-code-recording-project-");
		const skill = join(project, ".hobo", "recordings", "checkout-replay");
		mkdirSync(skill, { recursive: true });
		writeFileSync(join(skill, "SKILL.md"), "# Checkout replay\n");
		const harness = createHarnessCore({
			worldRoot: tempDir("hobo-code-recording-world-"),
			projectRoot: project,
		});

		expect(harness.useSkill("checkout-replay")).toMatchObject({
			name: "checkout-replay",
			available: true,
			pathHint: join(skill, "SKILL.md"),
		});
		expect(harness.listSkills().map(({ name }) => name)).toContain(
			"checkout-replay",
		);
		expect(harness.exposeMcp().tools).toContain("skill.checkout-replay");
		expect(() => harness.useSkill("../checkout-replay")).toThrow(
			"skill name must be a lowercase slug",
		);
	});

	it("keeps generated skill-name parsing aligned with the CUE invariant", () => {
		const cue = readFileSync(
			join(import.meta.dirname, "..", "data-models", "code_harness.cue"),
			"utf8",
		);
		const pattern = /#GeneratedSkillName:\s*string\s*&\s*=~"([^"]+)"/u.exec(
			cue,
		)?.[1];
		expect(pattern).toBeDefined();
		if (!pattern) throw new Error("GeneratedSkillName CUE regex is missing");
		const accepts = new RegExp(pattern);
		for (const value of ["repo", "checkout-replay", "a".repeat(128)]) {
			expect(parseSkillName(value)).toBe(value);
			expect(accepts.test(value)).toBe(true);
		}
		for (const value of ["../escape", "Checkout", "a".repeat(129), ""]) {
			expect(() => parseSkillName(value)).toThrow();
			expect(accepts.test(value)).toBe(false);
		}
	});

	it("falls back to repository recordings from a nested project", () => {
		const repository = tempDir("hobo-code-recording-repo-");
		mkdirSync(join(repository, ".git"));
		const project = join(repository, "packages", "app");
		const skill = join(repository, ".hobo", "recordings", "checkout-replay");
		const repoSkill = join(repository, ".agents", "skills", "repo-only");
		mkdirSync(project, { recursive: true });
		mkdirSync(skill, { recursive: true });
		mkdirSync(repoSkill, { recursive: true });
		writeFileSync(join(skill, "SKILL.md"), "# Checkout replay\n");
		writeFileSync(join(repoSkill, "SKILL.md"), "# Repo only\n");

		const harness = createHarnessCore({
			worldRoot: tempDir("hobo-code-recording-world-"),
			projectRoot: project,
		});
		expect(harness.useSkill("checkout-replay")).toMatchObject({
			available: true,
			pathHint: join(skill, "SKILL.md"),
		});
		expect(harness.useSkill("repo-only")).toMatchObject({
			available: true,
			pathHint: join(repoSkill, "SKILL.md"),
		});
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
		const capture = tempDir("hobo-code-capture-");
		const recording = join(capture, "recording.mp4");
		const screenshot = join(capture, "primary.png");
		writeFileSync(recording, Buffer.from("\0\0\0\u0018ftypisomreal capture"));
		writeFileSync(
			screenshot,
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]),
		);
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
			recordingMp4Path: recording,
			screenshotPaths: [screenshot],
		});
		expect(assertEvidenceTripleComplete(triple)).toBe(true);
		expect(existsSync(triple.playwrightScriptPath)).toBe(true);
		expect(existsSync(triple.recordingMp4Path)).toBe(true);
		expect(triple.screenshotPaths.length).toBeGreaterThan(0);
		expect(() =>
			emitEvidenceTriple({
				durableRoot: durable,
				flagKey: link.flagKey,
				scenario: link.scenario,
				passed: true,
				recordingMp4Path: join(capture, "missing.mp4"),
				screenshotPaths: [screenshot],
			}),
		).toThrow("recording capture does not exist");
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
			sidecars: false,
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
