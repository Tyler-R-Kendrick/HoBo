import { readFile } from "node:fs/promises";
import path from "node:path";

import type { CommandModule, HoboCli, YardRuntime } from "@hobo/cli";

export interface RunbookCommandDeps {
	// The shared Yard runtime the runbook's steps operate against — the same live
	// deployment state `up`/`inspect`/`drift` use. Injected by the composed CLI.
	readonly runtime?: YardRuntime;
	// Factory for the CLI the steps are dispatched through, sharing `runtime`.
	// Defaults to the composed HoBo CLI. Injectable for tests.
	readonly cliFactory?: (runtime: YardRuntime) => HoboCli;
}

interface RunbookStep {
	readonly verb: string;
	readonly args: readonly string[];
}

interface StepResult {
	readonly verb: string;
	readonly ok: boolean;
	readonly status: string;
}

// A runbook step must not re-enter `runbook` (no nesting) and should be a
// read-only diagnostic — the safe, replayable surface for incident response.
const NESTING_VERB = "runbook";

// Parse a runbook document (parse-don't-validate): a named, ordered list of
// steps, each a HoBo verb with optional args. Throws on a malformed shape.
function parseRunbook(raw: unknown): { name: string; steps: RunbookStep[] } {
	if (typeof raw !== "object" || raw === null) {
		throw new Error("runbook must be a JSON object");
	}
	const doc = raw as { name?: unknown; steps?: unknown };
	const name = typeof doc.name === "string" ? doc.name : "runbook";
	if (!Array.isArray(doc.steps)) {
		throw new Error("runbook.steps must be an array");
	}
	const steps: RunbookStep[] = doc.steps.map((entry, i) => {
		if (typeof entry !== "object" || entry === null) {
			throw new Error(`runbook.steps[${i}] must be an object`);
		}
		const step = entry as { verb?: unknown; args?: unknown };
		if (typeof step.verb !== "string" || step.verb.length === 0) {
			throw new Error(`runbook.steps[${i}].verb must be a non-empty string`);
		}
		const args = Array.isArray(step.args)
			? step.args.map((a) => String(a))
			: [];
		return { verb: step.verb, args };
	});
	return { name, steps };
}

// `hobo runbook <file>` — execute (or replay) an incident runbook: a named,
// ordered sequence of HoBo diagnostic steps run in order against the live
// deployment. Each step is dispatched through the composed CLI sharing the same
// runtime, so a runbook of `inspect` -> `drift` -> `verify` reflects the real
// deployment state. Read-only steps make replay idempotent. Nesting (`runbook`
// as a step) is rejected. Reads/writes only the local runtime — no credential.
export function createRunbookCommand(
	deps: RunbookCommandDeps = {},
): CommandModule {
	return {
		run: async ({ context, flags, args, emitProgress }) => {
			const { runtime } = deps;
			if (!runtime) {
				return {
					ok: false,
					status: "unavailable",
					code: "HOBO_NO_RUNTIME",
					message:
						"hobo runbook has no Yard runtime wired — run it from the composed `hobo` binary.",
					data: { command: "runbook" },
				};
			}

			const file = args[0];
			if (!file) {
				return {
					ok: false,
					status: "usage",
					code: "HOBO_RUNBOOK_NO_FILE",
					message: "hobo runbook needs a runbook file: `hobo runbook <file>`.",
					remediation: ["Pass the path to a runbook JSON file."],
					data: { command: "runbook" },
				};
			}

			const projectDir = context.projectDir ?? flags.cwd ?? context.cwd;
			const filePath = path.isAbsolute(file)
				? file
				: path.join(projectDir, file);

			let runbook: { name: string; steps: RunbookStep[] };
			try {
				runbook = parseRunbook(JSON.parse(await readFile(filePath, "utf8")));
			} catch (error) {
				return {
					ok: false,
					status: "invalid",
					code: "HOBO_RUNBOOK_INVALID",
					message: `hobo runbook: could not load "${file}": ${(error as Error).message}`,
					data: { command: "runbook", file },
				};
			}

			// The composed CLI, sharing this runtime, is how steps run against the
			// live deployment. A dynamic import defers the CLI module so the
			// runbook <-> cli import cycle resolves at call time, not load time.
			let cli: HoboCli;
			if (deps.cliFactory) {
				cli = deps.cliFactory(runtime);
			} else {
				const { createComposedHoboCli } = await import("./cli.js");
				cli = createComposedHoboCli({ yardRuntime: runtime });
			}

			const results: StepResult[] = [];
			for (const step of runbook.steps) {
				if (step.verb === NESTING_VERB) {
					results.push({
						verb: step.verb,
						ok: false,
						status: "nesting_rejected",
					});
					emitProgress(`${step.verb}: nesting_rejected`);
					continue;
				}
				const run = await cli.run([step.verb, ...step.args, "--json"], {
					cwd: projectDir,
				});
				let ok = false;
				let status = "error";
				try {
					const env = JSON.parse(run.stdout) as {
						ok?: boolean;
						status?: string;
					};
					ok = env.ok === true;
					status = env.status ?? "error";
				} catch {
					// Non-JSON output (e.g. a usage error) counts as a failed step.
				}
				results.push({ verb: step.verb, ok, status });
				emitProgress(`${step.verb}: ${status}`);
			}

			const failed = results.filter((r) => !r.ok);
			const passed = failed.length === 0;
			return {
				ok: passed,
				status: passed ? "completed" : "failed",
				code: passed ? "HOBO_OK" : "HOBO_RUNBOOK_FAILED",
				message: passed
					? `hobo runbook "${runbook.name}": ${results.length}/${results.length} step(s) ok`
					: `hobo runbook "${runbook.name}": ${failed.length} of ${results.length} step(s) failed (${failed.map((r) => r.verb).join(", ")})`,
				...(passed
					? {}
					: {
							remediation: failed.map((r) => `${r.verb}: ${r.status}`),
						}),
				data: {
					command: "runbook",
					name: runbook.name,
					steps: results,
				},
			};
		},
	};
}
