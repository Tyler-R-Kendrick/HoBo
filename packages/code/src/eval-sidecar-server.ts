/**
 * Always-on Camp evals sidecar. Hosts the default trainable golden suite
 * (exact-match over contract examples and traces).
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
	evaluatePromotionGate,
	GOLDEN_DEFAULT_SUITE_ID,
	type RubricReport,
	scoreTrainableGoldenSuite,
	type TrainableGoldenRegion,
} from "@hobo/evals";

import {
	type CampEvalSidecar,
	campEvalSidecar,
	inspectProjectEvalTests,
	inspectTrainableRegions,
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
	readonly trainable: readonly {
		readonly methodRef: string;
		readonly report: RubricReport;
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
}): EvalSidecarRun {
	const regions = input.suite.trainable.map((region) =>
		toGoldenRegion(region, input.actuals?.[region.methodRef] ?? []),
	);
	const scored = scoreTrainableGoldenSuite(regions);
	const trainable = scored.reports.map((report, index) => ({
		methodRef: regions[index]?.methodRef ?? report.rubricId,
		report,
	}));
	const gate =
		scored.reports[0] !== undefined
			? evaluatePromotionGate({ rubricReport: scored.reports[0] })
			: { ok: true, reasons: [] };
	return {
		ok: scored.ok,
		reports: scored.reports,
		trainable,
		...(input.suite.project !== undefined
			? { project: input.suite.project }
			: {}),
		gate,
	};
}

function toGoldenRegion(
	region: TrainableRegion,
	actuals: readonly unknown[],
): TrainableGoldenRegion {
	return {
		methodRef: region.methodRef,
		grounded: region.grounded,
		cases: region.examples.map((example, index) => {
			const actual = actuals[index];
			return {
				id: `example.${index}`,
				expected: example.output,
				...(actual !== undefined ? { actual } : {}),
			};
		}),
	};
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
				id: GOLDEN_DEFAULT_SUITE_ID,
				kind: "trainable-exact-match",
				suite,
			});
			return;
		}
		if (request.method === "POST" && path === "/run") {
			void readJsonBody(request).then((body) => {
				const actuals = parseActuals(body);
				writeJson(
					response,
					200,
					runEvalSidecarSuite({
						suite,
						...(actuals !== undefined ? { actuals } : {}),
					}),
				);
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
	const payload = `${JSON.stringify(body)}\n`;
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(payload),
	});
	response.end(payload);
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
