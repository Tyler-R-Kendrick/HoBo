import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	applyInContextEdit,
	buildMultiplexerStatus,
	CODE_FEATURE_FLAGS,
	createMemoryFeaturePort,
	createOpenUiSession,
	createPane,
	formatHoboCodeResult,
	lockVisualArtifact,
	renderOpenUiHtml,
	renderStatusChip,
	renderStatusSurface,
	renderStatusText,
	runHoboCodeCli,
	scaffoldHighValueTemplate,
	validateLockedVisual,
} from "../src/index.js";

const temps: string[] = [];
afterEach(() => {
	for (const d of temps) rmSync(d, { recursive: true, force: true });
	temps.length = 0;
});

function temp(prefix: string): string {
	const d = mkdtempSync(join(tmpdir(), prefix));
	temps.push(d);
	return d;
}

describe("hobo-code look/feel surfaces", () => {
	it("local remote marker avoids double middle-dot and empty panes denser", () => {
		const empty = buildMultiplexerStatus([], { remoteReady: false });
		const emptyText = renderStatusText(empty);
		expect(emptyText).toContain("○l");
		expect(emptyText).not.toMatch(/· · /);
		// default empty = logo + sprite-derived Bo idle loading (not empty→★ box)
		expect(emptyText).toContain("hobo-code·idle·○l");
		// half-block glyphs from bo-idle.png conversion
		expect(emptyText).toMatch(/[▀▄█]/);
		expect(emptyText).not.toContain("empty→★");
		expect(emptyText).not.toContain("empty — dispatch");
		expect(emptyText).not.toContain("to open work");
		expect(emptyText).not.toContain("no agent panes");
		const localBusy = buildMultiplexerStatus(
			[createPane("solo", "working", "busy")],
			{ remoteReady: false },
		);
		const localText = renderStatusText(localBusy);
		expect(localText).toContain("○l");
		expect(localText).not.toMatch(/· · /);
		expect(localText).toMatch(/●1·○l/);
		expect(localText).not.toContain("1p");
		expect(localText).not.toMatch(/\d+ active/);
		expect(localText).not.toContain("pane ");
		expect(localText).not.toContain("work ·");
		const chip = renderStatusChip(localBusy);
		expect(chip).toContain("○l");
		expect(chip).not.toMatch(/\d+ active/);
		expect(chip).not.toMatch(/· · /);
	});

	it("renderStatusText ships box chrome, focus marker, densified busy path", () => {
		const status = buildMultiplexerStatus(
			[
				createPane("coordinator", "working", "dispatching"),
				createPane("station", "done", "rail pinned"),
				createPane("watcher", "idle", "standby"),
			],
			{ remoteReady: true, theme: "herdr" },
		);
		const text = renderStatusText(status);
		expect(text).toMatch(/┌─+┐/);
		expect(text).toContain("hobo-code");
		expect(text).not.toContain("hobo-code · multiplexer");
		// one header: title · glued glyphs · next
		expect(text).toMatch(
			/hobo-code·●1○1✓1/,
		);
		expect(text).not.toContain("3 panes");
		expect(text).not.toMatch(/●1 work/);
		expect(text).not.toMatch(/○1 idle/);
		expect(text).not.toMatch(/✓1 done/);
		// health strip carries busy signal — no twin "N active"
		expect(text).not.toMatch(/\d+ active/);
		expect(text).not.toContain("⊙r");
		expect(text).not.toContain("theme herdr · remote ready");
		// busy path densified: no STATE table headers, no legend key
		expect(text).not.toMatch(/STATE\s+AGENT\s+SUMMARY/);
		expect(text).not.toMatch(/○ idle · ● work · ▲ wait · ✓ done · ▸ focus/);
		// ≤4 panes fold: working=focus+glyph alone; idle/done glyph alone
		expect(text).toMatch(/▸●co/);
		expect(text).not.toMatch(/▸●co·dispa/);
		// done station: no summary twin (glyph alone)
		expect(text).toMatch(/✓sn/);
		expect(text).not.toMatch(/✓sn·rail/);
		expect(text).toMatch(/○wch/);
		expect(text).not.toMatch(/▸● work\s+co/);
		expect(text).toMatch(/●co|○co|✓co/);
		expect(text).not.toContain("coordinator");
		// full "coord" label gone (co only)
		expect(text).not.toMatch(/\bcoord\b/);
		expect(text).toMatch(/st|★|promo|◆|◇|nd/);
		// folded busy: next is nd (nodes help tail)
		expect(text).toMatch(/·nd/);
		// author order: co before sn before wch (glyph-prefixed)
		expect(text.indexOf("●co")).toBeLessThan(text.indexOf("✓sn"));
		expect(text.indexOf("✓sn")).toBeLessThan(text.indexOf("○wch"));
		// no ellipsis on quiet busy fold
		expect(text).not.toContain("…");
		expect(text).not.toContain("dcc");
		expect(text).not.toContain("status · nodes");
		expect(text).not.toContain("detach·click·copy");
		expect(text).not.toContain("detach · click · copy");
		expect(text).not.toContain("hobo-code status");
		expect(text).toContain("hobo-code");
		expect(text).not.toMatch(/keys\s+detach/);
		expect(text).not.toMatch(/mux\s+detach · click · copy/);
		expect(text).not.toContain("copy-on-highlight");
		// jargon is compact footer, not a standalone wall line
		expect(text).not.toContain(
			"detachable · clickable panes · copy-on-highlight",
		);
		// 4-line busy fold: top · title · pane-fold · bot
		expect(text.trimEnd().split("\n").length).toBeLessThanOrEqual(4);
		const chip = renderStatusChip(status);
		expect(chip).toMatch(/hobo-code·●1○1✓1/);
		expect(chip).not.toContain("3p");
		// chip glyphs carry busy — no twin "N active"
		expect(chip).not.toMatch(/\d+ active/);
		// herdr is product default theme — omit on happy path
		expect(chip).not.toContain("herdr");
		const grokChip = renderStatusChip(
			buildMultiplexerStatus(status.panes, {
				remoteReady: true,
				theme: "grok-build",
			}),
		);
		expect(grokChip).toContain("grok-build");
		// chip lists working before idle/done
		const workGlyph = chip.indexOf("●1");
		const idleGlyph = chip.indexOf("○1");
		expect(workGlyph).toBeGreaterThan(-1);
		expect(workGlyph).toBeLessThan(idleGlyph);
		// closed surface frames chip under soft band (no "chip" word label)
		const surface = renderStatusSurface(status);
		expect(surface).toContain(text);
		expect(surface).toMatch(/┘\n·{10,}\n  hobo-code·/);
		expect(surface).toContain(chip);
		expect(surface).not.toMatch(/\nchip\n/);
		// chip strip after box (title may also embed chip-like glyphs)
		expect(surface.indexOf("└")).toBeLessThan(surface.lastIndexOf(chip));
		// embedded mode drops standalone next/mux footers
		const embedded = renderStatusText(status, {
			embedded: true,
			subtitle: "2 panes · final · ✓2 done",
		});
		expect(embedded).toMatch(/2 panes · final · ✓2 done/);
		expect(embedded).not.toContain("theme herdr");
		// embedded busy fold: compact glyphs on one line, no legend footer
		expect(embedded).toMatch(/▸●co/);
		expect(embedded).not.toMatch(/○ idle · ● work/);
		expect(embedded).not.toMatch(/legend\s+○ idle/);
		expect(embedded).not.toContain("detach · click panes");
		expect(embedded).not.toMatch(/next    hobo-code/);
		expect(embedded).not.toContain("detach · click · copy");
	});

	it("renderOpenUiHtml includes branded shell, step rail, and testids", () => {
		const draft = renderOpenUiHtml({
			prompt: "Checkout board",
			status: "draft",
		});
		expect(draft).toContain('data-testid="primary"');
		expect(draft).toContain('data-testid="badge"');
		expect(draft).toContain('data-testid="steps"');
		expect(draft).toContain("hobo-code");
		expect(draft).not.toContain("hobo-code · openui");
		expect(draft).toContain("color-scheme: dark");
		expect(draft).toContain("Checkout board");
		// meta denser: loop-chip only (flag/Astryx live in scaffold pin/title)
		expect(draft).not.toContain("app.visual.primary");
		expect(draft).not.toContain("OpenFeature · app.visual.primary");
		expect(draft).not.toContain(">Astryx<");
		expect(draft).not.toContain("Astryx / AHA");
		expect(draft).toContain("1 · generate");
		expect(draft).toContain("3 · lock");
		expect(draft).toContain('data-testid="lede"');
		expect(draft).toMatch(/@keyframes rise|prefers-reduced-motion/);
		// draft → generate done, edit current, lock todo
		expect(draft).toMatch(
			/data-testid="step-generate"[^>]*data-phase="done"/,
		);
		expect(draft).toMatch(
			/data-testid="step-edit"[^>]*data-phase="current"/,
		);
		expect(draft).toMatch(
			/data-testid="step-lock"[^>]*data-phase="todo"/,
		);
		// lede is outcome only (steps rail owns generate/edit/lock labels)
		expect(draft).toContain("→edit");
		expect(draft).not.toContain("→ edit");
		expect(draft).not.toContain("Next: edit");
		expect(draft).not.toContain("Draft · edit (2) · lock (3)");
		expect(draft).toContain("<title>OpenUI · draft ·");
		// loop-chip denser: bare next phase
		expect(draft).toMatch(/data-testid="loop-chip"[^>]*>edit</);
		expect(draft).not.toContain("loop · edit");
		expect(draft).toContain('data-testid="loop-chip"');
		expect(draft).toContain('content: "h"');
		expect(draft).toContain('data-testid="foot"');
		expect(draft).toContain("Edit→lock");
		expect(draft).not.toContain("Edit → lock");
		expect(draft).not.toContain("Draft · edit then lock");
		expect(draft).not.toContain("before codegen");
		expect(draft).not.toContain("Immutable");

		const ready = renderOpenUiHtml({
			prompt: "Checkout board",
			status: "ready-for-codegen",
		});
		expect(ready).toMatch(
			/data-testid="step-edit"[^>]*data-phase="done"/,
		);
		expect(ready).toMatch(
			/data-testid="step-lock"[^>]*data-phase="current"/,
		);
		expect(ready).toContain("→lock");
		expect(ready).not.toContain("→ lock");
		expect(ready).not.toContain("Next: lock");
		expect(ready).not.toContain("Edits applied · lock (3)");
		expect(ready).toMatch(/data-testid="loop-chip"[^>]*>lock</);
		expect(ready).not.toContain("loop · lock");
		expect(ready).toContain("Lock→codegen");
		expect(ready).not.toContain("Lock → codegen");
		expect(ready).not.toContain("Immutable");
		// long edit status truncates in badge chrome
		const long = renderOpenUiHtml({
			prompt: "Board",
			status: "ready-for-codegen-with-extra-detail",
		});
		expect(long).toMatch(/data-state="ready"/);
		expect(long).toMatch(/data-testid="badge"[^>]*>ready-for-codegen…</);
		expect(long).not.toContain("ready-for-codegen-with-extra-detail</span>");
	});

	it("lock path produces locked badge, complete step rail, primary testid", () => {
		const root = temp("look-vis-");
		let session = createOpenUiSession({
			durableRoot: root,
			prompt: "Pricing panel",
		});
		session = applyInContextEdit(session, "ready-for-codegen");
		const locked = lockVisualArtifact(session);
		const html = readFileSync(locked.htmlPath, "utf8");
		expect(html).toContain('data-locked="true"');
		expect(html).toContain('data-state="locked"');
		expect(html).toContain("Pricing panel");
		expect(html).toContain("→codegen");
		expect(html).not.toContain("truth · codegen");
		expect(html).toMatch(/data-testid="loop-chip"[^>]*>done</);
		expect(html).toContain(">seal<");
		expect(html).not.toContain("Immutable");
		expect(html).not.toContain("Source of truth");
		expect(html).not.toContain("Locked · source of truth");
		expect(html).toMatch(
			/data-testid="step-lock"[^>]*data-phase="done"/,
		);
		expect(html).toContain('data-testid="seal"');
		expect(html).toContain("◎ locked");
		expect(html).not.toContain("◎ locked · immutable");
		expect(html).not.toContain("immutable intermediary");
		expect(html).toContain("max-width: 520px");
		expect(html).not.toContain("loop done");
		expect(html).not.toContain("loop complete");
		// foot is bare seal (no twin of lede)
		expect(html).toMatch(/data-testid="foot"[^>]*>seal</);
		expect(html).not.toContain("Immutable · codegen + evidence");
		expect(html).not.toContain("source of truth for codegen and evidence");
		expect(html).not.toContain("Locked intermediary artifact");
		// locked card emphasis
		expect(html).toContain('.card[data-locked="true"]');
		expect(html).toContain("0 0 28px rgba(61,186,122,0.12)");
		expect(html).toContain('font-weight: 600');
		const v = validateLockedVisual(locked);
		expect(v.ok).toBe(true);
		expect(v.hasPrimary).toBe(true);
		expect(v.hasBadge).toBe(true);
	});

	it("scaffold first-paint assets include primary testid", () => {
		const out = temp("look-scaffold-");
		const result = scaffoldHighValueTemplate({
			outputDir: out,
			appName: "lookfeel",
		});
		expect(result.files).toContain("public/index.html");
		const html = readFileSync(join(out, "public/index.html"), "utf8");
		expect(html).toContain('data-testid="primary"');
		expect(html).toContain("OpenUI + Astryx Bindle");
		expect(html).toContain("styles.css");
		expect(html).toContain("hobo-code");
		expect(html).not.toContain("hobo-code · first paint");
		// sub line dropped — steps rail owns generate/edit/lock
		expect(html).not.toContain("Generate · edit · lock · evidence");
		expect(html).toContain(">★<");
		expect(html).not.toContain("flat·★");
		expect(html).not.toContain("flat·dispatch-default");
		expect(html).toContain('data-testid="steps"');
		expect(html).toContain("1 · generate");
		expect(html).toContain("3 · lock");
		expect(html).toContain('data-testid="hint"');
		expect(html).toContain("Edit→lock→evid");
		expect(html).not.toContain("Edit · lock · evidence");
		expect(html).not.toContain("Scaffold · edit · lock · evidence");
		expect(html).not.toContain("lock OpenUI before codegen");
		expect(html).toContain("mark-letter");
		expect(html).toMatch(/mark-letter">h</);
		expect(html).toContain('data-testid="foot"');
		// denser foot: flat·dispatch-default
		expect(html).not.toContain("flat verbs only");
		expect(html).not.toContain("default verb");
		expect(html).toContain("foot-mark");
		expect(html).toContain('data-testid="cards"');
		expect(html).toContain('data-step="1"');
		expect(html).toContain('data-step="2"');
		expect(html).toContain('data-step="3"');
		expect(html).toContain("1 · generate");
		expect(html).not.toContain("step 1 · generate");
		expect(html).toContain("panel-kicker");
		const css = readFileSync(join(out, "public/styles.css"), "utf8");
		expect(css).toContain(".hint");
		expect(css).toContain(".mark-letter");
		expect(css).toContain(".panel-kicker");
		expect(css).toContain('data-step="2"');
		expect(css).toContain("grid-template-columns: 1fr");
		expect(css).toContain('data-phase="current"');
		expect(css).toContain("font-weight: 600");
		const readme = readFileSync(join(out, "README.md"), "utf8");
		expect(readme).toContain("hobo-code");
		expect(readme).toContain("dispatch");
		expect(readme).toContain("1·generate");
		expect(readme).toContain("3·lock");
		expect(readme).not.toContain("1 generate  →");
		expect(readme).not.toMatch(/\bbuzz\b/);
		expect(readme).not.toContain("hobo code ");
		const feature = readFileSync(join(out, "features/visual.feature"), "utf8");
		expect(feature).toContain('data-testid "steps"');
		expect(feature).toContain('data-testid "seal"');
		expect(feature).toContain("generate → edit → lock");
	});

	it("formatHoboCodeResult surfaces status chrome as primary human output", async () => {
		const home = temp("look-cli-home-");
		const result = await runHoboCodeCli(["status"], { hoboHome: home });
		expect(result.ok).toBe(true);
		expect(result.code).toBe("HOBO_CODE_STATUS");
		// Plain default: English hierarchy (GUI-native), not glyph soup.
		expect(result.message).toContain("hobo-code");
		expect(result.message).toMatch(/session status|Agents:/i);
		expect(result.message).toMatch(/Next:/);
		expect(result.message).toMatch(/idle|working|done|blocked/);
		expect(result.message).not.toMatch(/┌─+┐/);
		expect(result.message).not.toMatch(/STATE\s+AGENT\s+SUMMARY/);
		expect(result.message).not.toContain("hobo-code · multiplexer");
		expect(result.message).not.toMatch(/\bbuzz\b/);
		expect(result.message).not.toContain("hobo code ");
		const human = formatHoboCodeResult(result, false);
		expect(human).toMatch(/Agents:/);
		expect(human).toMatch(/coord|station|auth/);
		// Dense opt-in restores power glyph box + Herdr/Grok footers.
		const dense = await runHoboCodeCli(["status", "--dense"], {
			hoboHome: home,
			dense: true,
		});
		expect(dense.ok).toBe(true);
		expect(dense.message).toMatch(/┌─+┐/);
		expect(dense.message).toMatch(/hobo-code·○2✓1/);
		expect(dense.message).toMatch(/○co·✓sn·○au/);
		expect(dense.message).toMatch(/herdr · panes · detach · highlight→copy/);
		expect(dense.message).toMatch(/grok-build · click · tasks · workflows/);
		// chip still available in data for status-bar consumers
		expect((result.data as { chip: string }).chip).toMatch(
			/hobo-code·○2✓1/,
		);
		const herdr = result.data as {
			herdr: {
				copyOnHighlight: boolean;
				detachable: boolean;
				theme: string;
				legend: string;
			};
			grokBuild: {
				mouseInteractive: boolean;
				clickableRegions: string[];
			};
			status: {
				copyOnHighlight: boolean;
				detachable: boolean;
				theme: string;
				clickableRegions: string[];
			};
		};
		expect(herdr.herdr.copyOnHighlight).toBe(true);
		expect(herdr.herdr.detachable).toBe(true);
		expect(herdr.herdr.theme).toBe("herdr");
		expect(herdr.grokBuild.mouseInteractive).toBe(true);
		expect(herdr.grokBuild.clickableRegions).toContain("still-running");
		expect(herdr.status.copyOnHighlight).toBe(true);
		expect(herdr.status.detachable).toBe(true);
		expect(herdr.status.theme).toBe("herdr");
		expect(herdr.status.clickableRegions.length).toBeGreaterThan(0);
	});

	it("help is plain-text legible with usage, verbs, flags, and examples", async () => {
		const help = await runHoboCodeCli(["help"]);
		const out = formatHoboCodeResult(help, false);
		expect(help.data).toMatchObject({
			defaultVerb: "dispatch",
			binary: "hobo-code",
			defaults: expect.any(Object),
			dense: false,
		});
		// Readable structure (not glyph soup) by default — grouped hierarchy
		expect(out).toMatch(/^hobo-code — /m);
		expect(out).toMatch(/^Usage:/m);
		expect(out).toMatch(/^Start here:/m);
		expect(out).toMatch(/^Session & status:/m);
		expect(out).toMatch(/^Flags:/m);
		expect(out).toMatch(/^First run:/m);
		expect(out).toMatch(/^Examples:/m);
		expect(out).toMatch(/plain by default/i);
		expect(out).toContain("dispatch");
		expect(out).toContain("auth login");
		expect(out).toContain("guide");
		expect(out).toContain("env");
		expect(out).toContain("isolate");
		expect(out).toContain("--json");
		expect(out).toContain("--dense");
		expect(out).toContain("--home <path>");
		expect(out).toContain("HOBO_HOME");
		// Dense strip is opt-in only
		expect(out).not.toMatch(/^hobo-code★●hemrd$/m);
		expect(out).not.toMatch(/^★d·st·se·sc·i·pr$/m);
		expect(out).not.toMatch(/^ev·au$/m);
		expect(out).not.toMatch(/\bbuzz\b/);
		expect(out).not.toContain("hobo code ");
		const helpLines = out.trimEnd().split("\n");
		expect(helpLines.length).toBeGreaterThan(10);
	});

	it("help --dense restores power-user glyph strip with idiom legend", async () => {
		const help = await runHoboCodeCli(["help", "--dense"]);
		const out = formatHoboCodeResult(help, { dense: true });
		expect(out).toMatch(/^hobo-code★●hemrd$/m);
		expect(out).toMatch(/^★d·st·se·sc·i·pr$/m);
		expect(out).toMatch(/^ev·au·mo$/m);
		expect(out).toMatch(/dense chrome/);
		expect(out).toMatch(/★d=dispatch-default/);
		expect(out).toMatch(/i=isolate/);
		expect(out).not.toMatch(/^Usage:/m);
	});

	it.skip("closed panel chrome uses soft title band and bottom rule", async () => {
		const home = temp("look-panel-home-");
		const project = temp("look-panel-proj-");
		const dispatch = await runHoboCodeCli(["panel chrome"], {
			hoboHome: home,
			cwd: project,
		});
		const human = formatHoboCodeResult(dispatch, false);
		// bare prompt → defaulted ★ title (dispatch implied)
		expect(human).toContain("✓ ★");
		// soft title underline (·) then body then bottom rule (─)
		expect(human).toMatch(/✓ ★\n(?:·{10,}\n)?/);
		expect(human).toMatch(/\n─{10,}\n?$/m);
		const lines = human.trimEnd().split("\n");
		const last = lines[lines.length - 1] ?? "";
		expect(last).toMatch(/^─{10,}$/);
		// platform also closed
		const platform = await runHoboCodeCli(["platform"], { hoboHome: home });
		const pOut = formatHoboCodeResult(platform, false);
		expect(pOut).toMatch(/▣ pl\n(?:·{10,}\n)?/);
		const pLines = pOut.trimEnd().split("\n");
		expect(pLines[pLines.length - 1]).toMatch(/^─{10,}$/);
	});

	it("dispatch default verb human output is multi-line summary", async () => {
		const home = temp("look-dispatch-home-");
		const project = temp("look-dispatch-proj-");
		const result = await runHoboCodeCli(["ship the first paint"], {
			hoboHome: home,
			cwd: project,
		});
		expect(result.ok).toBe(true);
		expect(result.code).toBe("HOBO_CODE_DISPATCH");
		const human = formatHoboCodeResult(result, false);
		// defaulted bare prompt: title uses ★ (dispatch implied); no hobo-code twin
		expect(human).toContain("✓ ★");
		expect(human).not.toContain("hobo-code dispatch");
		expect(human).not.toContain("hobo-code ★");
		expect(human).not.toContain("hobo-code★");
		// done: prompt·st — title ★ owns default; task id in data only
		// prompt shortId(8) — long text truncates in chrome
		expect(human).toMatch(
			/ship th…·st/,
		);
		expect(human).not.toMatch(/ · ◆ · /);
		expect(human).not.toMatch(/\S+ · ✓ · /);
		// task id omitted on done happy path
		expect(human).not.toMatch(/^\s+\S+… · /m);
		expect(human).not.toMatch(/^ task · /m);
		expect(human).not.toContain(" · default · ");
		expect(human).not.toContain("done ✓");
		expect(human).not.toMatch(/^  pipeline\s+/m);
		expect(human).not.toMatch(/^  status\s+/m);
		expect(human).not.toMatch(/^  note\s+/m);
		expect(human).not.toMatch(/^  prompt\s+/m);
		expect(human).not.toMatch(/queue ● → claim ● → run ● → done ✓/);
		expect(human).not.toContain("queued");
		expect(human).not.toContain("bare prompt");
		// next verb is last token (st) — no "next" word
		expect(human).toMatch(/·st$/m);
		expect(human).not.toContain("next st");
		expect(human).not.toMatch(/^  next\s+/m);
		expect(human).not.toMatch(/next\s+status · rooms/);
		expect(human).not.toMatch(/next\s+hobo-code /);
		// local · station happy path omitted on done dispatch
		expect(human).not.toMatch(/^  node\s+/m);
		expect(human).not.toMatch(/node\s+node-local-station-local/);
		expect(human).toMatch(/─{10,}/);
		// happy-path done: 3-line panel when soft omitted (title · task · rule)
		expect(human.trimEnd().split("\n").length).toBeLessThanOrEqual(4);
		// long prompt truncates in task chrome; full text stays in data
		const longPrompt = `x${"y".repeat(60)}`;
		const long = await runHoboCodeCli([longPrompt], {
			hoboHome: home,
			cwd: project,
		});
		const longOut = formatHoboCodeResult(long, false);
		expect(long.ok).toBe(true);
		expect(longOut).toMatch(/.{1,12}…?·st/);
		expect(longOut).not.toMatch(/ · ◆ · /);
		expect(longOut).not.toContain(longPrompt);
		expect(longOut).not.toMatch(/^  prompt\s+/m);
		expect((long.data as { task: { prompt: string } }).task.prompt).toBe(
			longPrompt,
		);
		const explicit = await runHoboCodeCli(
			["dispatch", "explicit"],
			{ hoboHome: home, cwd: project },
		);
		const explicitOut = formatHoboCodeResult(explicit, false);
		expect(explicit.ok).toBe(true);
		// explicit verb uses short title d (matches help tail)
		expect(explicitOut).toContain("✓ d");
		expect(explicitOut).not.toContain("hobo-code d");
		expect(explicitOut).not.toContain("hobo-code dispatch");
		expect(explicitOut).toMatch(
			/explicit·st/,
		);
		expect(explicitOut).not.toMatch(/\S+ · ✓ · explicit/);
		expect(explicitOut).not.toMatch(/ · ◆ · /);
		expect(explicitOut).not.toContain("hobo-code ★");
		expect(explicitOut).not.toContain(" · default · ");
		expect(explicitOut).not.toMatch(/^  note\s+/m);
		expect(explicitOut).toMatch(/·st/);
		expect(
			(explicit.data as { defaultVerb: boolean }).defaultVerb,
		).toBe(false);
	});

	it("empty argv still dispatches with panel chrome", async () => {
		const home = temp("look-empty-home-");
		const project = temp("look-empty-proj-");
		const result = await runHoboCodeCli([], {
			hoboHome: home,
			cwd: project,
		});
		const human = formatHoboCodeResult(result, false);
		expect(result.ok).toBe(true);
		expect(result.code).toBe("HOBO_CODE_DISPATCH");
		expect(human).toContain("◆");
		expect(human).toContain("empty");
		// done: ◆empty·st (seed text twin omitted; ponytail in data)
		expect(human).toMatch(
			/◆empty·st/,
		);
		expect(human).not.toContain("refine scaffold");
		expect(human).not.toContain("empty→ponytail");
		expect(human).not.toContain("ponytail");
		expect(human).not.toContain("empty argv");
		expect(human).not.toMatch(/^  note\s+/m);
		expect(human).not.toMatch(/^  pipeline\s+/m);
		expect(human).not.toMatch(/^  prompt\s+/m);
	});


	it.skip("nodes inventory is human-readable without buzz nesting", async () => {
		const home = temp("look-nodes-home-");
		const result = await runHoboCodeCli(["nodes"], { hoboHome: home });
		const human = formatHoboCodeResult(result, false);
		expect(result.ok).toBe(true);
		expect(human).toContain("▣ n");
		expect(human).not.toContain("hobo-code n");
		// short class labels for scan (ep=endpoint lo=local); capacity glued
		expect(human).toMatch(/●ep\d+|●lo\d+/);
		// idle all-free: one nodes row (no table)
		expect(human).toMatch(
			/\d+·●ep\d+·●lo\d+/,
		);
		expect(human).not.toMatch(/· 0 busy ·/);
		expect(human).not.toMatch(/^  summary\s+/m);
		expect(human).not.toMatch(/CLASS\s+LOAD\s+RUN\/CAP/);
		expect(human).not.toContain("BUSY");
		expect(human).not.toMatch(/^  cols\s+/m);
		expect(human).toMatch(/●ep\d+|●lo\d+/);
		expect(human).not.toMatch(/●endpoint|●local/);
		expect(human).not.toMatch(/● on\s+endpoint|● on\s+local/);
		// ★ dispatch next omitted (product default)
		expect(human).not.toMatch(/·★/);
		expect(human).not.toMatch(/next\s+dispatch/);
		expect(human).not.toMatch(/next\s+hobo-code /);
		expect(human).toMatch(/▣ n[^\n]*\n(?:·{10,}\n)?/);
		expect(human).not.toMatch(/\bbuzz\b/);
	});

	it.skip("budget and platform human layouts are structured panels", async () => {
		const home = temp("look-budget-home-");
		const budget = await runHoboCodeCli(["budget"], { hoboHome: home });
		const budgetOut = formatHoboCodeResult(budget, false);
		expect(budgetOut).toContain("◈ b");
		expect(budgetOut).not.toContain("hobo-code b");
		// zero-spend: drop meter bar; off=0 default omitted (docs own disable)
		// st next omitted (product default observe)
		expect(budgetOut).toMatch(/\$0\/\$\d+(?:\.\d+)?·●mon(?!·st)/);
		expect(budgetOut).not.toMatch(/●mon·st/);
		expect(budgetOut).not.toContain("$5.00");
		expect(budgetOut).not.toContain("priv");
		expect(budgetOut).not.toContain("cheapest");
		expect(budgetOut).not.toContain("mon·wait");
		expect(budgetOut).not.toMatch(/^ spend · /m);
		expect(budgetOut).not.toContain("never code");
		expect(budgetOut).not.toContain("off=0");
		expect(budgetOut).not.toContain("MONETIZATION=0");
		expect(budgetOut).not.toMatch(/^  meter\s+/m);
		expect(budgetOut).not.toMatch(/^  routing\s+/m);
		expect(budgetOut).not.toMatch(/^  monetize\s+/m);
		expect(budgetOut).not.toMatch(/^  privacy\s+/m);
		expect(budgetOut).not.toMatch(/^  sponsored\s+/m);
		expect(budgetOut).not.toMatch(/^  disable\s+/m);
		// zero spend: no capacity bar chrome
		expect(budgetOut).not.toMatch(/\[█|\[░/);
		expect(budgetOut).not.toContain("never code/prompts");
		expect(budgetOut).not.toContain("never inspects code");
		expect(budgetOut).not.toContain("status wait");
		expect(budgetOut).toMatch(/●mon|★|promo|◆|◇/);
		expect(budgetOut).not.toContain("wait surface");
		expect(budgetOut).not.toMatch(/^  slot\s+/m);
		expect(budgetOut).not.toContain("HOBO_CODE_MONETIZATION=0");
		expect(budgetOut).not.toContain("feature code.monetization");
		expect(budgetOut).not.toContain("feature set code.monetization");
		expect(budgetOut).not.toContain("--percent");
		expect(budgetOut).toMatch(/◈ b\n(?:·{10,}\n)?/);
		const platform = await runHoboCodeCli(["platform"], { hoboHome: home });
		const platformOut = formatHoboCodeResult(platform, false);
		expect(platformOut).toContain("▣ pl");
		expect(platformOut).not.toContain("hobo-code pl");
		// rail LED/hash · next — all● is product default (omit on happy path)
		expect(platformOut).toMatch(/●·\S+/);
		expect(platformOut).not.toMatch(/●·\S+·st$/m);
		expect(platformOut).not.toContain("all●");
		expect(platformOut).not.toMatch(/^ station · /m);
		expect(platformOut).not.toContain("● present");
		expect(platformOut).not.toMatch(/^  rail\s+/m);
		expect(platformOut).not.toMatch(/^  flags\s+/m);
		// all-on happy path: all● omitted (product default); strip only when off
		expect(platformOut).not.toContain("all●");
		expect(platformOut).not.toContain("●monetize");
		expect(platformOut).not.toContain("●mon");
		expect(platformOut).not.toContain("●dist");
		expect(platformOut).not.toContain("●monetization");
		expect(platformOut).not.toContain("●distributed");
		expect(platformOut).not.toContain("distributed");
		expect(platformOut).not.toContain("all ON");
		expect(platformOut).not.toContain("product default");
		// default flue: omit provider row (happy path); never show composition noise
		expect(platformOut).not.toContain("(composition)");
		expect(platformOut).not.toContain("withastro/");
		expect(platformOut).not.toMatch(/^  provider\s+/m);
		expect(platformOut).toMatch(/●·|▣ pl/);
		// all-on: strip only — no redundant per-flag rows
		expect(platformOut).not.toMatch(/harness\s+● on/);
		expect(platformOut).not.toMatch(/evidence\s+● on/);
		// single-line provider (no orphan packageHint row)
		expect(platformOut).not.toMatch(/\n\s{10,}\S+\//);
		// old parenthetical form is gone
		expect(platformOut).not.toMatch(/station:local \(present\)/);

		// any-off: fold into station row (no detail table)
		const offPort = createMemoryFeaturePort({
			[CODE_FEATURE_FLAGS.distributed]: false,
		});
		const offPlat = await runHoboCodeCli(["platform"], {
			hoboHome: home,
			features: offPort,
		});
		const offOut = formatHoboCodeResult(offPlat, false);
		// strip shows ○dist; count only (no twin ○dist list / detail table)
		expect(offOut).toMatch(/○dist·1○/);
		expect(offOut).not.toMatch(/○dist·1○·st/);
		expect(offOut).not.toMatch(/1 off · ○dist/);
		expect(offOut).not.toMatch(/off · detail/);
		expect(offOut).not.toMatch(/^  flags\s+/m);
		expect(offOut).not.toMatch(/^\s+dist\s+○ off/m);
		const remote = await runHoboCodeCli(["remote"], { hoboHome: home });
		const remoteOut = formatHoboCodeResult(remote, false);
		expect(remoteOut).toContain("◎ re");
		expect(remoteOut).not.toContain("hobo-code re");
		// host folds reach + dns + mosh LED (no twin rows)
		// code/mux default omitted when host brands it; title brands remote
		// .hobo.localhost suffix dropped on scan line
		// host brands mux — →mux twin omitted on happy path
		expect(remoteOut).toMatch(/code\.mux/);
		expect(remoteOut).not.toMatch(/code\.mux·st/);
		expect(remoteOut).not.toContain("→mux");
		expect(remoteOut).not.toContain("hobo.localhost");
		expect(remoteOut).not.toContain("op→mux");
		expect(remoteOut).not.toContain("op→named→mux");
		expect(remoteOut).not.toMatch(/^ host · /m);
		expect(remoteOut).not.toContain("code/mux");
		expect(remoteOut).not.toMatch(/^  reach\s+/m);
		expect(remoteOut).not.toMatch(/^  dns\s+/m);
		expect(remoteOut).not.toMatch(/^  mosh\s+/m);
		expect(remoteOut).not.toMatch(/^  resource\s+/m);
		expect(remoteOut).not.toContain("named endpoint");
		// ADR + mosh off live in docs — omit happy-path chrome twins
		expect(remoteOut).not.toContain("ADR-0130");
		expect(remoteOut).not.toContain("mosh ○");
		// default local: omit mode/station noise; no redundant https://host url
		expect(remoteOut).not.toMatch(/^  mode\s+/m);
		expect(remoteOut).not.toMatch(/^  station\s+/m);
		expect(remoteOut).not.toMatch(/^  url\s+https:\/\//m);
		expect(remoteOut).not.toContain("optional resilience");
		expect(remoteOut).not.toContain("TCP detach fails");
		expect(remoteOut).not.toContain("phone SSH");
		expect(remoteOut).toMatch(/◎ re\n(?:·{10,}\n)?/);
	});

	it("scaffold human output highlights first-paint path", async () => {
		const home = temp("look-scaffold-home-");
		const project = temp("look-scaffold-proj-");
		const result = await runHoboCodeCli(["scaffold", "demo-ui"], {
			hoboHome: home,
			cwd: project,
		});
		const human = formatHoboCodeResult(result, false);
		expect(result.ok).toBe(true);
		expect(human).toContain("✦ sc");
		expect(human).not.toContain("hobo-code sc");
		// one row: template · name · files · pin · next (title brands scaffold)
		expect(human).toMatch(
			/ou·demo-ui·\d+f·p/,
		);
		expect(human).not.toMatch(/ou·demo-ui·\d+f·p·★/);
		expect(human).not.toContain("primary");
		expect(human).not.toContain("●paint");
		expect(human).not.toContain("openui ·");
		expect(human).not.toContain("visual.primary");
		expect(human).not.toMatch(/^ app · /m);
		// happy-path out == name — omitted twin
		expect(human).not.toMatch(/openui · demo-ui · (\.\/)?demo-ui ·/);
		expect(human).not.toContain("scaffold●");
		expect(human).not.toContain("scaf●→open○→lock○→evid○");
		expect(human).not.toContain("●index · ●css");
		expect(human).not.toContain("app.visual.primary");
		expect(human).not.toContain("visual.feature");
		expect(human).not.toMatch(/visual\.primary · visual ·/);
		expect(human).not.toContain("openui-astryx-bindle");
		expect(human).not.toContain("openui-astryx");
		expect(human).not.toMatch(/^  template\s+/m);
		expect(human).not.toMatch(/^  out\s+/m);
		expect(human).not.toMatch(/^  files\s+/m);
		expect(human).not.toMatch(/^  pin\s+/m);
		expect(human).not.toMatch(/^  loop\s+/m);
		expect(human).not.toMatch(/^  steps\s+/m);
		expect(human).not.toContain("generate ● → edit ○");
		expect(human).not.toContain("1 generate");
		expect(human).not.toContain("4 evidence");
		expect(human).not.toContain("features/visual.feature");
		expect(human).not.toMatch(/^  flag\s+/m);
		expect(human).not.toMatch(/^  gherkin\s+/m);
		expect(human).toMatch(/✦ sc\n(?:·{10,}\n)?/);
		// scannable out path under project cwd
		expect(human).not.toMatch(/ \/tmp\//);
		// ★ dispatch next omitted (product default)
		expect(human).not.toMatch(/·★/);
		expect(human).not.toContain("open·lock·★");
		expect(human).not.toMatch(/^  next\s+/m);
		expect(human).not.toContain("open index");
		expect(human).not.toContain("lock OpenUI");
		expect(human).not.toContain("public/index.html");
		expect(human).not.toMatch(/^            lock /m);
		// denser than the old multi-row scaffold panel
		expect(human.trimEnd().split("\n").length).toBeLessThan(8);
	});

	it("isolate and session panels surface lifecycle chrome", async () => {
		const home = temp("look-iso-home-");
		const project = temp("look-iso-proj-");
		const isolate = await runHoboCodeCli(["isolate", "look-run"], {
			hoboHome: home,
			cwd: project,
		});
		const isoOut = formatHoboCodeResult(isolate, false);
		expect(isolate.ok).toBe(true);
		expect(isoOut).toContain("▣ i");
		expect(isoOut).not.toContain("hobo-code i");
		expect(isoOut).not.toContain("hobo-code iso");
		expect(isoOut).not.toContain("hobo-code isolate");
		// lifecycle folded into run row (LEDs only: create/work/evid/promo/clean)
		// open run: create● only (no full LED strip)
		expect(isoOut).toMatch(/·●/);
		expect(isoOut).not.toContain("●○○○○");
		expect(isoOut).not.toContain("c●→w○");
		expect(isoOut).not.toMatch(/^  lifecycle\s+/m);
		expect(isoOut).not.toContain("evidence○");
		expect(isoOut).not.toContain("create ● →");
		// worktree is product default — omit backend row
		expect(isoOut).not.toMatch(/^  backend\s+/m);
		// branch == run id is default (code/<run>) — omit twin row
		expect(isoOut).not.toMatch(/^  branch\s+/m);
		// default sandboxes root + ○orphans clean omitted on happy path
		expect(isoOut).not.toContain("$HOBO_HOME/sandboxes");
		expect(isoOut).not.toContain("tree read-only");
		expect(isoOut).not.toMatch(/^  mediated\s+/m);
		// run · id · create● (root/orphans defaults omitted)
		expect(isoOut).toMatch(/look-run·●/);
		expect(isoOut).toMatch(/next · hobo-code promote look-run/);
		expect(isoOut).toMatch(/durable ·/);
		expect(isoOut).not.toContain("○orphans");
		expect(isoOut).not.toContain("orphans clean");
		expect(isoOut).not.toContain("read-only");
		expect(isoOut).not.toMatch(/ · active · /);
		expect(isoOut).not.toMatch(/ · ro · /);
		expect(isoOut).not.toMatch(/^  root\s+/m);
		expect(isoOut).not.toMatch(/^  orphans\s+/m);
		expect(isoOut).not.toContain("active ok");
		expect(isoOut).not.toContain("active run expected");
		expect(isoOut).not.toContain("aside from active run");
		expect(isoOut).toMatch(/▣ isolate\n(?:·{10,}\n)?/);
		const session = await runHoboCodeCli(["session"], {
			hoboHome: home,
			cwd: project,
			env: { HOBO_CODE_EPHEMERAL_SESSION: "1" },
		});
		const sessOut = formatHoboCodeResult(session, false);
		expect(session.ok).toBe(true);
		// 4-line session: se title (no hobo-code twin — product on other verbs)
		expect(sessOut).toMatch(/✓ se·/);
		expect(sessOut).not.toContain("hobo-code se");
		// clean final: ● alone; st next omitted (product default observe)
		expect(sessOut).toMatch(/✓ se·\S+·●/);
		expect(sessOut).not.toMatch(/✓ se·\S+·●·st/);
		expect(sessOut).not.toContain("●clean");
		expect(sessOut).not.toContain("final·next");
		expect(sessOut).toMatch(/┌─+┐/);
		// no standalone mux chrome twin
		expect(sessOut).not.toMatch(/mux · ✓ se/);
		// no twin "mux · final" band / soft panel
		expect(sessOut).not.toMatch(/mux · final\n·{10,}\n┌/);
		// final/done session is quiet — no STATE table headers
		expect(sessOut).not.toMatch(/STATE\s+AGENT\s+SUMMARY/);
		// embedded: no twin chip strip under box
		expect(sessOut).toMatch(/┘\n*$/m);
		expect(sessOut).not.toMatch(/┘\n·{10,}\n  /);
		expect(sessOut).not.toMatch(/\nchip\n/);
		// clean handback: promote done; st next omitted (default observe)
		expect(sessOut).not.toMatch(/·st/);
		expect(sessOut).not.toMatch(/promote /);
		// no twin handback/run rows
		expect(sessOut).not.toMatch(/^  run\s+/m);
		expect(sessOut).not.toMatch(/^  handback\s+/m);
		expect(sessOut).not.toContain("● cleaned");
		expect(sessOut).not.toMatch(/^  orphans\s+/m);
		expect(sessOut).not.toMatch(/^  snapshot\s+/m);
		expect(sessOut).not.toMatch(/^  backend\s+/m);
		// quiet path: panes folded one line (glyph alone = done/clean)
		expect(sessOut).toMatch(/✓co·✓wk/);
		expect(sessOut).not.toContain("✓co done");
		expect(sessOut).not.toContain("complete");
		expect(sessOut).not.toContain("session complete");
		expect(sessOut).not.toContain("handback clean");
		expect(sessOut).not.toMatch(/▸● work/);
		expect(sessOut).not.toContain("mux       status chrome below");
		// embedded mux drops standalone next/mux footers
		expect(sessOut).not.toContain("detach · click panes · copy-on-highlight");
		expect(sessOut).not.toMatch(
			/│ next    hobo-code "…"  ·  hobo-code join <name>/,
		);
		// ● implies final; glyphs live in pane fold
		expect(sessOut).not.toContain("final·");
		expect(sessOut).not.toMatch(/\d+ panes · final/);
		expect(sessOut).not.toMatch(/final · ✓\d+ done/);
		expect(sessOut).not.toMatch(/final · theme herdr/);
		// 4-line box only (title folded in); no twin success code
		expect(sessOut.trimEnd().split("\n").length).toBeLessThanOrEqual(4);
		expect(sessOut).not.toContain("HOBO_CODE_SESSION");

		// keep-open path paints live/working snapshot
		const live = await runHoboCodeCli(["session"], {
			hoboHome: home,
			cwd: project,
			env: {
				HOBO_CODE_EPHEMERAL_SESSION: "1",
				HOBO_CODE_SESSION_KEEP: "1",
			},
		});
		const liveOut = formatHoboCodeResult(live, false);
		expect(live.ok).toBe(true);
		// live lives in title override (no twin band / mux prefix)
		expect(liveOut).toMatch(
			/✓ se·\S+·●o·pr/,
		);
		expect(liveOut).not.toContain("hobo-code se");
		expect(liveOut).not.toContain("●open");
		expect(liveOut).not.toContain("promo");
		expect(liveOut).not.toContain("live·next");
		expect(liveOut).not.toMatch(/mux · ✓ se/);
		expect(liveOut).not.toMatch(/mux · live\n/);
		expect(liveOut).not.toContain("mux · live snapshot");
		expect(liveOut).not.toMatch(/^  handback\s+/m);
		// open + clean orphans: fold orphans (no twin row)
		expect(liveOut).not.toMatch(/^  orphans\s+/m);
		// open session still points at promote (pr help tail)
		expect(liveOut).toMatch(/·pr/);
		expect(liveOut).not.toMatch(/promote/);
		expect(liveOut).not.toContain("promo");
		expect(liveOut).not.toMatch(/^  snapshot\s+/m);
		// flue happy path: working glyph alone (no open/work/flue pane noise)
		expect(liveOut).toMatch(/▸●co/);
		expect(liveOut).toMatch(/▸●wk/);
		expect(liveOut).not.toContain("open · flue");
		expect(liveOut).not.toContain("work · flue");
		expect(liveOut).not.toMatch(/▸●co open/);
		expect(liveOut).not.toMatch(/▸●wk work/);
		expect(liveOut).not.toMatch(/\d+ panes · live/);
		expect(liveOut).not.toMatch(/live · ●\d+ work/);
		expect(liveOut).not.toMatch(/live · theme herdr/);
		expect(liveOut).not.toContain("detach · click panes · copy-on-highlight");
		expect(liveOut.trimEnd().split("\n").length).toBeLessThanOrEqual(4);
		expect(liveOut).not.toContain("HOBO_CODE_SESSION");
	});

	it.skip("join/rooms/agent verbs are removed (not a buzz hive product)", async () => {
		const home = temp("look-no-hive-");
		for (const verb of ["rooms", "join", "agent"] as const) {
			const r = await runHoboCodeCli([verb, "x"], { hoboHome: home });
			expect(r.code).not.toMatch(/HOBO_CODE_JOIN|HOBO_CODE_AGENT|HOBO_CODE_HIVE|HOBO_CODE_ROOMS/);
		}
		const nodes = await runHoboCodeCli(["nodes"], { hoboHome: home });
		expect(nodes.ok).toBe(true);
		expect(nodes.code).toBe("HOBO_CODE_NODES");
	});

	it("promote missing run id uses structured usage panel", async () => {
		const result = await runHoboCodeCli(["promote"]);
		const human = formatHoboCodeResult(result, false);
		expect(result.ok).toBe(false);
		expect(human).toMatch(/✕ promote/);
		expect(human).toMatch(/missing run id/i);
		expect(human).toMatch(/hobo-code promote/);
		expect(human).toMatch(/isolate/);
		expect(result.code).toBe("HOBO_CODE_USAGE");
		expect(result.remediation?.length).toBeGreaterThan(0);
		// never leak JS undefined into human chrome
		expect(human).not.toContain("undefined");
		expect(human).not.toMatch(/─{10,}\n\n✕ HOBO_CODE_USAGE\s*$/);
		expect(human.trimEnd().split("\n").every((l) => l.length <= 100)).toBe(
			true,
		);
	});

	it("promote success lists gate checklist hierarchy", async () => {
		const home = temp("look-promo-home-");
		const project = temp("look-promo-proj-");
		await runHoboCodeCli(["isolate", "promo-look"], {
			hoboHome: home,
			cwd: project,
		});
		const promo = await runHoboCodeCli(["promote", "promo-look"], {
			hoboHome: home,
			cwd: project,
		});
		const human = formatHoboCodeResult(promo, false);
		expect(promo.ok).toBe(true);
		expect(human).toContain("✓ promote");
		// success: run row with LEDs + gates + next
		expect(human).toMatch(/promo-look·●clean·●4/);
		expect(human).toMatch(/next · hobo-code status/);
		expect(human).not.toContain("clean·squash");
		expect(human).not.toContain("gates ●");
		expect(human).not.toContain("arch·std·agent·docs");
		expect(human).not.toMatch(/✓ architecture:guard/);
		expect(human).not.toContain("via squash-only path;");
	});

	it("distributed-off fail panel is structured with fix block", async () => {
		const home = temp("look-dist-off-");
		const project = temp("look-dist-off-proj-");
		const features = createMemoryFeaturePort({
			[CODE_FEATURE_FLAGS.distributed]: false,
		});
		const result = await runHoboCodeCli(["dispatch", "nope"], {
			hoboHome: home,
			cwd: project,
			features,
		});
		const human = formatHoboCodeResult(result, false);
		expect(result.ok).toBe(false);
		expect(human).toMatch(/✕ distributed/);
		expect(human).toMatch(/code\.distributed/);
		expect(human).toMatch(/enable/i);
		expect(result.code).toBe("HOBO_CODE_DISTRIBUTED_DISABLED");
		expect(result.remediation?.length).toBeGreaterThan(0);
		expect(human).not.toContain("undefined");
		expect(human).not.toMatch(
			/─{10,}\n\n✕ HOBO_CODE_DISTRIBUTED_DISABLED\s*$/,
		);
	});

	it("harness-off fail panel names the flag and next steps", async () => {
		const home = temp("look-harness-off-");
		const project = temp("look-harness-off-proj-");
		const features = createMemoryFeaturePort({
			[CODE_FEATURE_FLAGS.harnessEnabled]: false,
		});
		const result = await runHoboCodeCli(["isolate", "r1"], {
			hoboHome: home,
			cwd: project,
			features,
		});
		const human = formatHoboCodeResult(result, false);
		expect(result.ok).toBe(false);
		expect(human).toMatch(/✕ isolate/);
		expect(human).toMatch(/harness disabled/i);
		expect(human).toMatch(/code\.harness\.enabled/);
		expect(result.code).toBe("HOBO_CODE_HARNESS_DISABLED");
		expect(result.remediation?.length).toBeGreaterThan(0);
		expect(human).not.toContain("undefined");
	});
});
