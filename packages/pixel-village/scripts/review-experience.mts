/**
 * Advisory HYX vision review — NEVER blocking.
 *
 * Reads the evidence PNGs the tour already wrote (`public/shots/`, plus
 * `public/shots/keyframes/` when present) and any seam-state snapshots, and
 * asks a vision-capable Claude model to score each `auto-visual: true` item in
 * `docs/validation/hyx-rubric.yaml` on the rubric's 0-3 scale.
 *
 * Determinism: three samples per (item × image), median recorded. Note that
 * `temperature` is NOT sent — it is removed on `claude-fable-5` and returns a
 * 400 there — so sample-median is the only variance control available.
 *
 * Outputs:
 *   public/shots/experience-review.json        (full report)
 *   docs/validation/scores/agent-history.jsonl (one appended row per run)
 *
 * Offline: exits 0 and writes `{"skipped": true, ...}` when ANTHROPIC_API_KEY
 * is absent, so `pnpm run review:experience` is safe in CI and on a plane.
 */

import { execFileSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	isJsonNumber,
	isJsonObject,
	isJsonString,
	parseJsonValue,
	type JsonObject,
} from "../src/json.js";


const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "public/shots");
const KEYFRAMES = join(SHOTS, "keyframes");
const RUBRIC = join(ROOT, "docs/validation/hyx-rubric.yaml");
const SCORES_DIR = join(ROOT, "docs/validation/scores");
const HISTORY = join(SCORES_DIR, "agent-history.jsonl");
const REPORT = join(SHOTS, "experience-review.json");

/** Vision-capable model; `claude-fable-5` rejects temperature/top_p/top_k. */
const MODEL = "claude-fable-5";
const SAMPLES = 3;
const MAX_IMAGES = 8;

type RubricItem = Readonly<{ id: string; category: string; text: string }>;

/**
 * Minimal reader for the auto-visual subset of hyx-rubric.yaml. The rubric is
 * a small, hand-authored, fixed-shape document; a full YAML parser would be a
 * dependency for one file we control.
 */
function readAutoVisualItems(yaml: string): RubricItem[] {
	const items: RubricItem[] = [];
	let category = "";
	let id = "";
	let text = "";
	let inText = false;
	const flush = (autoVisual: boolean) => {
		if (autoVisual && id) {
			items.push(Object.freeze({ id, category, text: text.trim() }));
		}
		id = "";
		text = "";
	};
	const lines = yaml.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const cat = line.match(/^ {2}([a-z][a-z0-9-]*):\s*(#.*)?$/u);
		if (cat?.[1] && cat[1] !== "items") {
			category = cat[1];
			continue;
		}
		const idMatch = line.match(/^\s*- id:\s*(\S+)\s*$/u);
		if (idMatch?.[1]) {
			// Close the previous item: a following `auto-visual` line would have
			// been seen already, so decide with the lookahead below instead.
			id = idMatch[1];
			text = "";
			inText = false;
			// Scan forward to this item's own auto-visual flag / text block.
			let autoVisual = false;
			for (let j = i + 1; j < lines.length; j++) {
				const next = lines[j] ?? "";
				if (
					/^\s*- id:\s*\S+/u.test(next) ||
					/^ {2}[a-z][a-z0-9-]*:/u.test(next)
				) {
					break;
				}
				if (/^\s*auto-visual:\s*true\s*$/u.test(next)) autoVisual = true;
				if (/^\s*text:\s*>-\s*$/u.test(next)) {
					inText = true;
					continue;
				}
				if (inText) {
					if (/^\s*[a-z-]+:/u.test(next)) {
						inText = false;
						continue;
					}
					text += `${next.trim()} `;
				}
			}
			flush(autoVisual);
		}
	}
	return items;
}

function listPngs(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => extname(f).toLowerCase() === ".png")
		.filter((f) => !f.includes(".diff."))
		.map((f) => join(dir, f))
		.filter((f) => statSync(f).isFile() && statSync(f).size > 2048)
		.sort();
}

interface GitInfo {
	sha: string;
	date: string;
}

interface ReviewSample {
	score?: number;
	why?: string;
}

function parseReviewSample(text: string): ReviewSample {
	const value = parseJsonValue(text);
	if (!isJsonObject(value)) return {};
	const sample: ReviewSample = {};
	if (isJsonNumber(value.score)) sample.score = value.score;
	if (isJsonString(value.why)) sample.why = value.why;
	return sample;
}

function gitInfo(): GitInfo {
	const run = (args: string[]) => {
		try {
			return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
		} catch {
			return "";
		}
	};
	return {
		sha: run(["rev-parse", "HEAD"]) || "unknown",
		date: run(["log", "-1", "--format=%cI"]) || new Date().toISOString(),
	};
}

function median(values: readonly number[]): number {
	if (values.length === 0) return Number.NaN;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	const hi = sorted[mid] ?? Number.NaN;
	const lo = sorted[mid - 1] ?? Number.NaN;
	return sorted.length % 2 === 1 ? hi : (lo + hi) / 2;
}

function writeSkipped(reason: string): void {
	mkdirSync(SHOTS, { recursive: true });
	const body = {
		skipped: true,
		reason,
		generatedAt: new Date().toISOString(),
		model: MODEL,
		rubric: "docs/validation/hyx-rubric.yaml",
	};
	writeFileSync(REPORT, `${JSON.stringify(body, null, 2)}\n`);
	console.log(`experience review skipped: ${reason}`);
	console.log(`wrote ${REPORT}`);
}

async function main(): Promise<void> {
	if (!process.env.ANTHROPIC_API_KEY) {
		writeSkipped("ANTHROPIC_API_KEY is not set (offline run)");
		return;
	}
	if (!existsSync(RUBRIC)) {
		writeSkipped(`rubric not found: ${RUBRIC}`);
		return;
	}

	const items = readAutoVisualItems(readFileSync(RUBRIC, "utf8"));
	if (items.length === 0) {
		writeSkipped("rubric has no auto-visual items");
		return;
	}

	const images = [...listPngs(SHOTS), ...listPngs(KEYFRAMES)].slice(
		0,
		MAX_IMAGES,
	);
	if (images.length === 0) {
		writeSkipped(
			"no evidence PNGs under public/shots (run the evidence tour first)",
		);
		return;
	}

	// Seam-state snapshots, when the tour wrote them, give the judge the ground
	// truth behind the picture (TRU-4: nothing decorative may read as signal).
	const seamSnapshots: JsonObject = {};
	for (const name of ["visual-report.json", "seam-states.json"]) {
		const path = join(SHOTS, name);
		if (existsSync(path)) {
			try {
				seamSnapshots[name] = JSON.parse(readFileSync(path, "utf8"));
			} catch {
				/* a malformed snapshot is not worth failing an advisory pass */
			}
		}
	}

	const { default: Anthropic } = await import("@anthropic-ai/sdk");
	const client = new Anthropic();

	const systemPrompt = [
		"You are grading a rubberhose-cartoon control-plane game UI (the HoBo Yard)",
		"against the HYX experience rubric. Score ONLY from what the screenshots show.",
		"Scale: 0 = absent/broken, 1 = present but poor, 2 = adequate, 3 = delightful.",
		'Reply with JSON only: {"score": <0-3 integer>, "why": "<= 200 chars"}.',
	].join(" ");

	type Sample = { score: number; why: string };
	const results: Record<
		string,
		{ category: string; text: string; samples: Sample[]; median: number }
	> = {};

	for (const item of items) {
		const samples: Sample[] = [];
		for (let s = 0; s < SAMPLES; s++) {
			const content: Anthropic.ContentBlockParam[] = images.map((path) => ({
				type: "image" as const,
				source: {
					type: "base64" as const,
					media_type: "image/png" as const,
					data: readFileSync(path).toString("base64"),
				},
			}));
			content.push({
				type: "text",
				text: [
					`Rubric item ${item.id} (category: ${item.category}):`,
					item.text,
					"",
					`Evidence files, in order: ${images.map((p) => basename(p)).join(", ")}`,
					Object.keys(seamSnapshots).length > 0
						? `Seam-state snapshots: ${JSON.stringify(seamSnapshots).slice(0, 4000)}`
						: "",
					"",
					"Score this single item now.",
				]
					.filter(Boolean)
					.join("\n"),
			});

			try {
				// No `temperature`: sampling parameters are rejected on this model.
				// Variance is controlled by taking the median of SAMPLES runs.
				const response = await client.messages.create({
					model: MODEL,
					max_tokens: 1024,
					system: systemPrompt,
					messages: [{ role: "user", content }],
				});
				if (response.stop_reason === "refusal") {
					samples.push({ score: Number.NaN, why: "model refused" });
					continue;
				}
				const text = response.content
					.filter((b): b is Anthropic.TextBlock => b.type === "text")
					.map((b) => b.text)
					.join("");
				const json = text.match(/\{[\s\S]*\}/u)?.[0];
				const parsed = json ? parseReviewSample(json) : {};
				samples.push({
					score: Number(parsed.score),
					why: String(parsed.why ?? "").slice(0, 200),
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				samples.push({
					score: Number.NaN,
					why: `error: ${message.slice(0, 120)}`,
				});
			}
		}
		const scored = samples
			.map((x) => x.score)
			.filter((n) => Number.isFinite(n));
		results[item.id] = {
			category: item.category,
			text: item.text,
			samples,
			median: median(scored),
		};
		console.log(
			`${item.id} median=${results[item.id]?.median} (${scored.length}/${SAMPLES} scored)`,
		);
	}

	const git = gitInfo();
	const report = {
		skipped: false,
		generatedAt: new Date().toISOString(),
		model: MODEL,
		samplesPerItem: SAMPLES,
		rubric: "docs/validation/hyx-rubric.yaml",
		images: images.map((p) => basename(p)),
		git,
		items: results,
	};
	mkdirSync(SHOTS, { recursive: true });
	writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

	mkdirSync(SCORES_DIR, { recursive: true });
	const row = {
		date: git.date,
		sha: git.sha,
		model: MODEL,
		medians: Object.fromEntries(
			Object.entries(results).map(([id, r]) => [id, r.median]),
		),
	};
	appendFileSync(HISTORY, `${JSON.stringify(row)}\n`);

	console.log(`wrote ${REPORT}`);
	console.log(`appended ${HISTORY}`);
	console.log("experience review is ADVISORY — it never blocks.");
}

await main().catch((err) => {
	// Advisory by contract: report and exit 0.
	console.error(`experience review failed (advisory): ${String(err)}`);
	// SAFETY: `writeSkipped(`error: ${String((err as Error).message ?? err).slice(0, 200)}`);` is required at this I/O or test boundary.
	writeSkipped(`error: ${String((err as Error).message ?? err).slice(0, 200)}`);
});
