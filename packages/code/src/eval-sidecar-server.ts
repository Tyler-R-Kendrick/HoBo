/**
 * Always-on Camp evals sidecar. Hosts gold (exact-match) and silver
 * (property/fuzz) suites over trainable regions.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
	evaluatePromotionGate,
	GOLDEN_DEFAULT_SUITE_ID,
	type RubricReport,
	SILVER_DEFAULT_SUITE_ID,
	scoreTrainableGoldSilverSuites,
	silverEvidenceFromRegion,
	type TrainableGoldenRegion,
	type TrainableSilverEvidence,
} from "@hobo/evals";
import {
	fuzzTrainable,
	type TrainableFn,
	type TrainableFuzzSeed,
} from "@hobo/fuzz";

import {
	type CampEvalSidecar,
	campEvalSidecar,
	inspectProjectEvalTests,
	inspectTrainableRegions,
	loadTrainableInvokers,
	type TrainableRegion,
} from "./eval-sidecar.js";
import { occupancyNamedOrigin } from "./occupancy-endpoints.js";

export interface EvalSidecarServer {
	readonly url: string;
	readonly port: number;
	readonly suite: CampEvalSidecar;
	readonly close: () => Promise<void>;
}

export interface StartEvalSidecarOptions {
	readonly campId: string;
	readonly projectDir?: string;
	readonly port?: number;
}

export interface EvalSidecarRun {
	readonly ok: boolean;
	readonly reports: readonly RubricReport[];
	readonly gold: {
		readonly ok: boolean;
		readonly reports: readonly RubricReport[];
	};
	readonly silver: {
		readonly ok: boolean;
		readonly reports: readonly RubricReport[];
	};
	readonly trainable: readonly {
		readonly methodRef: string;
		readonly report: RubricReport;
		readonly silver?: RubricReport;
	}[];
	readonly project?: CampEvalSidecar["project"];
	readonly gate: ReturnType<typeof evaluatePromotionGate>;
}

export function assembleCampEvalSidecar(
	campId: string,
	projectDir?: string,
): CampEvalSidecar {
	if (projectDir === undefined) return campEvalSidecar(campId);
	const tests = inspectProjectEvalTests(projectDir);
	const trainable = inspectTrainableRegions(projectDir);
	return campEvalSidecar(campId, {
		trainable,
		...(tests !== undefined ? { tests } : {}),
	});
}

export function runEvalSidecarSuite(input: {
	readonly suite: CampEvalSidecar;
	readonly actuals?: Readonly<Record<string, readonly unknown[]>>;
	readonly invokers?: Readonly<Record<string, TrainableFn>>;
}): EvalSidecarRun {
	const regions = input.suite.trainable.map((region) =>
		toGoldenRegion(
			region,
			input.actuals?.[region.methodRef] ?? [],
			input.invokers?.[region.methodRef],
		),
	);
	const silverEvidence = input.suite.trainable.map((region, index) =>
		toSilverEvidence(
			region,
			regions[index] ?? {
				methodRef: region.methodRef,
				grounded: region.grounded,
				cases: [],
			},
			input.invokers?.[region.methodRef],
		),
	);
	const scored = scoreTrainableGoldSilverSuites({
		regions,
		silver: silverEvidence,
	});
	const trainable = scored.gold.reports.map((report, index) => ({
		methodRef: regions[index]?.methodRef ?? report.rubricId,
		report,
		...(scored.silver.reports[index]
			? { silver: scored.silver.reports[index] }
			: {}),
	}));
	const gate = composePromotionGates([
		...scored.gold.reports,
		...scored.silver.reports,
	]);
	return {
		ok: scored.ok,
		reports: scored.gold.reports,
		gold: scored.gold,
		silver: scored.silver,
		trainable,
		...(input.suite.project !== undefined
			? { project: input.suite.project }
			: {}),
		gate,
	};
}

function composePromotionGates(
	reports: readonly RubricReport[],
): ReturnType<typeof evaluatePromotionGate> {
	if (reports.length === 0) return { ok: true, reasons: [] };
	const reasons: Array<
		ReturnType<typeof evaluatePromotionGate>["reasons"][number]
	> = [];
	for (const report of reports) {
		const next = evaluatePromotionGate({ rubricReport: report });
		reasons.push(...next.reasons);
	}
	return { ok: reasons.length === 0, reasons };
}

function toGoldenRegion(
	region: TrainableRegion,
	actuals: readonly unknown[],
	fn?: TrainableFn,
): TrainableGoldenRegion {
	return {
		methodRef: region.methodRef,
		grounded: region.grounded,
		cases: region.examples.map((example, index) => {
			const posted = Object.hasOwn(actuals, index);
			if (!posted && !fn) {
				return {
					id: `example.${index}`,
					expected: example.output,
				};
			}
			return {
				id: `example.${index}`,
				expected: example.output,
				actual: posted
					? actuals[index]
					: invokeForGold(fn as TrainableFn, example.input),
			};
		}),
	};
}

function invokeForGold(fn: TrainableFn, input: unknown): unknown {
	try {
		const output = fn(input);
		if (
			output &&
			typeof output === "object" &&
			"then" in output &&
			typeof (output as { then?: unknown }).then === "function"
		) {
			return undefined;
		}
		return output;
	} catch {
		return undefined;
	}
}

function toSilverEvidence(
	region: TrainableRegion,
	golden: TrainableGoldenRegion,
	fn?: TrainableFn,
): TrainableSilverEvidence {
	if (!fn) return silverEvidenceFromRegion(golden);
	const seeds: TrainableFuzzSeed[] = region.examples.map((example) => ({
		input: example.input,
		output: example.output,
	}));
	const fuzz = fuzzTrainable(fn, seeds, { methodRef: region.methodRef });
	return silverEvidenceFromRegion(golden, fuzz);
}

export async function startEvalSidecar(
	options: StartEvalSidecarOptions,
): Promise<EvalSidecarServer> {
	const suite = assembleCampEvalSidecar(options.campId, options.projectDir);
	const server = createServer((request, response) => {
		const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
		if (request.method === "GET" && (path === "/" || path === "/health")) {
			writeJson(response, 200, {
				name: "evals",
				hosting: "same-camp",
				live: true,
				suite,
			});
			return;
		}
		if (request.method === "GET" && path === "/suite") {
			writeJson(response, 200, {
				gold: {
					id: GOLDEN_DEFAULT_SUITE_ID,
					kind: "trainable-exact-match",
				},
				silver: {
					id: SILVER_DEFAULT_SUITE_ID,
					kind: "trainable-property-fuzz",
				},
				suite,
			});
			return;
		}
		if (request.method === "POST" && path === "/run") {
			void readJsonBody(request)
				.then(async (body) => {
					const actuals = parseActuals(body);
					const loaded = options.projectDir
						? await loadTrainableInvokers(options.projectDir, suite.trainable)
						: {};
					const invokers = Object.keys(loaded).length > 0 ? loaded : undefined;
					writeJson(
						response,
						200,
						runEvalSidecarSuite({
							suite,
							...(actuals !== undefined ? { actuals } : {}),
							...(invokers !== undefined ? { invokers } : {}),
						}),
					);
				})
				.catch(() => {
					if (!response.headersSent) {
						writeJson(response, 500, {
							ok: false,
							error: "eval-run-failed",
						});
					}
				});
			return;
		}
		writeJson(response, 404, { ok: false, error: "not found" });
	});
	const port = await listen(server, options.port ?? 8789);
	return {
		url: occupancyNamedOrigin("evals", port),
		port,
		suite,
		close: () => closeServer(server),
	};
}

function writeJson(
	response: import("node:http").ServerResponse,
	status: number,
	body: unknown,
): void {
	const payload = `${safeJson(body)}\n`;
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(payload),
	});
	response.end(payload);
}

function safeJson(body: unknown): string {
	const seen = new WeakSet<object>();
	try {
		return JSON.stringify(body, (_key, value: unknown) => {
			if (typeof value === "bigint") return `${value}n`;
			if (typeof value === "number" && Number.isNaN(value)) return "NaN";
			if (value && typeof value === "object") {
				if (seen.has(value)) return "[Cycle]";
				seen.add(value);
			}
			return value;
		});
	} catch {
		return JSON.stringify({ ok: false, error: "eval-unserializable" });
	}
}

function listen(server: Server, port: number): Promise<number> {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", () => {
			resolve((server.address() as AddressInfo).port);
		});
	});
}

function closeServer(server: Server): Promise<void> {
	return new Promise((resolve) => {
		server.close(() => resolve());
	});
}

function readJsonBody(
	request: import("node:http").IncomingMessage,
): Promise<unknown> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		request.on("data", (chunk) => {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		});
		request.on("end", () => {
			if (chunks.length === 0) {
				resolve(undefined);
				return;
			}
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch {
				resolve(undefined);
			}
		});
		request.on("error", () => resolve(undefined));
	});
}

function parseActuals(
	body: unknown,
): Readonly<Record<string, readonly unknown[]>> | undefined {
	if (!body || typeof body !== "object") return undefined;
	const raw = (body as { actuals?: unknown }).actuals;
	if (!raw || typeof raw !== "object") return undefined;
	const actuals: Record<string, unknown[]> = {};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		if (!Array.isArray(value)) continue;
		actuals[key] = value;
	}
	return Object.keys(actuals).length > 0 ? actuals : undefined;
}
