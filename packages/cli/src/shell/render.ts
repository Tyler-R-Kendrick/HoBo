import type { CliContext, CliEnvelope, CommandResult } from "../types/envelope.js";
import { buildEnvelope, publicContext } from "../types/envelope.js";
import { CliError } from "./errors.js";
import type { CliFlags } from "./parse.js";

export interface CliRunResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export function renderSuccess(input: {
	readonly verb: string;
	readonly flags: CliFlags;
	readonly context: CliContext;
	readonly result: CommandResult;
}): CliRunResult {
	const envelope = buildEnvelope(input);
	const exitCode = envelope.ok
		? 0
		: envelope.code === "HOBO_BUILD_USAGE" || envelope.code === "HOBO_CLI_USAGE"
			? 2
			: 1;

	if (input.flags.json) {
		return okText(`${JSON.stringify(envelope)}\n`, exitCode);
	}

	if (input.flags.quiet) {
		return okText("", exitCode);
	}

	if (input.verb === "new" && envelope.ok) {
		const nextSteps = Array.isArray(envelope.data.nextSteps)
			? (envelope.data.nextSteps as string[]).join("\n")
			: "";
		return okText(
			`Created HoBo project ${String(envelope.data.name ?? "")}\n\n${nextSteps}\n`,
			exitCode,
		);
	}

	return okText(
		`Command  Status
${input.verb.padEnd(8)} ${envelope.status}

${envelope.message}
`,
		exitCode,
	);
}

export function renderError(
	error: unknown,
	input: { readonly verb: string | null; readonly flags: CliFlags; readonly context?: CliContext },
): CliRunResult {
	if (error instanceof CliError) {
		if (input.flags.json) {
			const envelope: CliEnvelope = {
				ok: false,
				verb: input.verb ?? "",
				status: "error",
				code: error.code,
				message: error.message.split("\n")[0] ?? error.message,
				remediation: error.remediation,
				context: publicContext(
					input.context ?? {
						cwd: input.flags.cwd,
						projectDir: null,
						identity: null,
						clients: { readApi: "stub", runtime: "stub" },
					},
				),
				data: {},
			};
			return {
				exitCode: error.exitCode,
				stdout: `${JSON.stringify(envelope)}\n`,
				stderr: "",
			};
		}

		return {
			exitCode: error.exitCode,
			stdout: "",
			stderr: `${error.message}\n`,
		};
	}

	if (input.flags.json) {
		const envelope: CliEnvelope = {
			ok: false,
			verb: input.verb ?? "",
			status: "error",
			code: "HOBO_CLI_INTERNAL",
			message: "Internal CLI error. Re-run with --verbose for diagnostics.",
			remediation: ["Re-run with --verbose and report the stderr output."],
			context: publicContext(
				input.context ?? {
					cwd: input.flags.cwd,
					projectDir: null,
					identity: null,
					clients: { readApi: "stub", runtime: "stub" },
				},
			),
			data: {},
		};
		return {
			exitCode: 1,
			stdout: `${JSON.stringify(envelope)}\n`,
			stderr: "",
		};
	}

	return {
		exitCode: 1,
		stdout: "",
		stderr: "Internal CLI error. Re-run with --verbose for diagnostics.\n",
	};
}

function okText(stdout: string, exitCode = 0): CliRunResult {
	return {
		exitCode,
		stdout,
		stderr: "",
	};
}

export function envelopeToRunResult(envelope: CliEnvelope, flags: CliFlags): CliRunResult {
	if (flags.json) {
		return okText(`${JSON.stringify(envelope)}\n`, envelope.ok ? 0 : 1);
	}
	return renderSuccess({
		verb: envelope.verb,
		flags,
		context: envelope.context,
		result: envelope,
	});
}
