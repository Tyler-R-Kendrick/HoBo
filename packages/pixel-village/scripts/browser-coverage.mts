/**
 * How much of the browser-only source the e2e suite actually executes.
 *
 * `packages/pixel-village` reports ~61% branch coverage in the vitest lane, and
 * most of the gap is in modules vitest cannot run at all: `main.ts` instantiates
 * `Phaser.Game`, the scene modules reach for `document`, and none of it loads
 * outside a browser. The standing assumption has been that the Playwright suite
 * covers them instead. This measures whether that is true, rather than
 * asserting it.
 *
 * Method, with no new dependencies:
 *
 *   1. The harness bundles the entry with esbuild and now emits a sourcemap.
 *   2. Chromium's V8 coverage (`page.coverage.startJSCoverage`) reports which
 *      byte ranges of that bundle ran.
 *   3. Node's own `SourceMap` (`node:module`) maps bundle offsets back to the
 *      original source files.
 *
 * The result is executed bytes per source file — not branch coverage, and it
 * does not merge into the vitest report. It answers the narrower question the
 * lane decision actually turns on: *is this code exercised by the browser suite
 * at all, and roughly how much of it?* Byte coverage overstates branch coverage
 * (a line can run without every arm of its conditionals being taken), so treat
 * a high number here as "reached", not as "covered".
 *
 * Usage:
 *   HOBO_PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium \
 *     node --import tsx scripts/browser-coverage.mts
 */
import { SourceMap } from "node:module";
import { startHarness } from "./demo-harness.mts";

/** Playwright reports V8 ranges as startOffset/endOffset, not start/end. */
type Range = { startOffset: number; endOffset: number; count: number };

/** One scenario plus the seam calls that open the surfaces a load alone misses. */
const SCENARIOS = [
	"quiet-yard",
	"incident-storm",
	"deploy-saga",
	"first-run",
] as const;

async function main(): Promise<void> {
	const executablePath = process.env.HOBO_PLAYWRIGHT_CHROMIUM;
	const { chromium } = await import("playwright");
	const harness = await startHarness({ seedFixtures: true });
	const browser = await chromium.launch(
		executablePath ? { executablePath } : {},
	);

	/** bundle url -> executed byte ranges, merged across every page visit. */
	const executedByUrl = new Map<string, Range[]>();
	/** bundle url -> its source text, kept for the sourcemap lookup. */
	const sourceByUrl = new Map<string, string>();

	try {
		for (const scenario of SCENARIOS) {
			const page = await browser.newPage({
				viewport: { width: 1400, height: 920 },
			});
			await page.coverage.startJSCoverage({ resetOnNavigation: false });
			await page.goto(harness.gameUrl({ scenario }));
			// The yard signals readiness through the same seam the specs use.
			await page
				.waitForFunction(
					() =>
						(window as unknown as { __TEST__?: { ready?: boolean } }).__TEST__
							?.ready === true,
					{ timeout: 60_000 },
				)
				.catch(() => undefined);
			await page.waitForTimeout(1500);
			// Open a sheet and flip the theme so the DOM overlay's branches run.
			await page
				.evaluate(() => {
					type Seam = {
						commands: {
							selectZone?: (z: string) => void;
							setTheme?: (t: string) => void;
						};
					};
					const seam = (window as unknown as { __TEST__?: Seam }).__TEST__;
					seam?.commands?.selectZone?.("connectionBay");
					seam?.commands?.setTheme?.("night");
				})
				.catch(() => undefined);
			await page.waitForTimeout(800);

			for (const entry of await page.coverage.stopJSCoverage()) {
				if (!entry.url.includes("yard.js")) continue;
				sourceByUrl.set(entry.url, entry.source ?? "");
				const merged = executedByUrl.get(entry.url) ?? [];
				// Every range, not just the executed ones. V8 nests them: an
				// outer range with count>0 spans the whole function, and inner
				// count===0 ranges carve out the parts that did not run. Keeping
				// only count>0 marks entire functions as executed and reports
				// 100% for everything, which is how this was wrong first.
				for (const fn of entry.functions) merged.push(...fn.ranges);
				executedByUrl.set(entry.url, merged);
			}
			await page.close();
		}
	} finally {
		await browser.close();
		await harness.close();
	}

	report(executedByUrl, sourceByUrl);
}

/** Attribute executed bundle bytes back to the sources that produced them. */
function report(
	executedByUrl: Map<string, Range[]>,
	sourceByUrl: Map<string, string>,
): void {
	const totalBySource = new Map<string, number>();

	for (const [url, ranges] of executedByUrl) {
		const bundle = sourceByUrl.get(url) ?? "";
		if (bundle.length === 0) continue;
		const map = loadSourceMap(bundle);
		if (!map) {
			console.error(`no sourcemap for ${url}; cannot attribute coverage`);
			continue;
		}
		// The inline sourcemap is a single multi-megabyte line at the end of the
		// bundle. `findEntry` answers with the nearest preceding mapping for any
		// position it has no entry for, so leaving that line in attributes ~14MB
		// of base64 to whichever source happened to compile last. Stop at the
		// marker.
		const codeEnd = bundle.lastIndexOf("//# sourceMappingURL=");
		const limit = codeEnd < 0 ? bundle.length : codeEnd;
		// Offsets are cheaper to resolve through a prefix table than by
		// re-scanning the bundle for every lookup.
		const lineStarts = buildLineStarts(bundle);
		const covered = new Uint8Array(bundle.length);
		// Applied in the order V8 emits them -- outer first, then the inner
		// carve-outs -- so a later count===0 range correctly un-marks the part
		// of its enclosing function that never ran.
		for (const range of ranges) {
			const mark = range.count > 0 ? 1 : 0;
			for (
				let i = range.startOffset;
				i < range.endOffset && i < covered.length;
				i += 1
			) {
				covered[i] = mark;
			}
		}
		for (let line = 0; line < lineStarts.length; line += 1) {
			const start = lineStarts[line] ?? 0;
			if (start >= limit) break;
			const end = Math.min(lineStarts[line + 1] ?? bundle.length, limit);
			if (end <= start) continue;
			const entry = map.findEntry(line, 0);
			const file = entry?.originalSource;
			if (!file?.includes("/src/")) continue;
			const rel = file.slice(file.indexOf("/src/") + 1);
			totalBySource.set(rel, (totalBySource.get(rel) ?? 0) + (end - start));
			let ran = 0;
			for (let i = start; i < end; i += 1) if (covered[i] === 1) ran += 1;
			executedBytes.set(rel, (executedBytes.get(rel) ?? 0) + ran);
		}
	}

	const rows = [...totalBySource.entries()]
		.map(([file, total]) => ({
			file,
			total,
			ran: executedBytes.get(file) ?? 0,
		}))
		.sort((a, b) => b.total - a.total);

	console.log("\nbrowser-executed bytes per source (e2e harness, 4 scenarios)");
	console.log("  NOTE: bytes reached, not branches covered.\n");
	let ranAll = 0;
	let totalAll = 0;
	for (const row of rows) {
		ranAll += row.ran;
		totalAll += row.total;
		const pct = row.total === 0 ? 0 : (100 * row.ran) / row.total;
		console.log(
			`${pct.toFixed(0).padStart(4)}%  ${String(row.ran).padStart(7)}/${String(
				row.total,
			).padEnd(7)} ${row.file}`,
		);
	}
	const pct = totalAll === 0 ? 0 : (100 * ranAll) / totalAll;
	console.log(`\n${pct.toFixed(1)}% overall (${ranAll}/${totalAll} bytes)`);
}

const executedBytes = new Map<string, number>();

function buildLineStarts(text: string): number[] {
	const starts = [0];
	for (let i = 0; i < text.length; i += 1) {
		if (text.charCodeAt(i) === 10) starts.push(i + 1);
	}
	return starts;
}

/**
 * The harness bundles with `sourcemap: "inline"`, so the map rides along.
 *
 * Found by string search rather than a regex: the inlined payload is several
 * megabytes of base64 on one line, and `\S+` against it overflows the stack.
 */
function loadSourceMap(bundle: string): SourceMap | undefined {
	const marker = "//# sourceMappingURL=data:";
	const at = bundle.lastIndexOf(marker);
	if (at < 0) return undefined;
	const comma = bundle.indexOf(",", at);
	if (comma < 0) return undefined;
	const end = bundle.indexOf("\n", comma);
	const base64 = bundle.slice(comma + 1, end < 0 ? undefined : end).trim();
	try {
		return new SourceMap(
			// SAFETY: the payload is the sourcemap esbuild inlined into the bundle.
			JSON.parse(Buffer.from(base64, "base64").toString("utf8")),
		);
	} catch {
		return undefined;
	}
}

await main();
