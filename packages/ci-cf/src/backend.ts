import { create, fromJsonString } from "@bufbuild/protobuf";
import type { CiContext, CiRunnerResult } from "@cloudflare/ci";
import type {
	CloseReason,
	PipelineBackend,
	PipelineCapability,
} from "@hobo/ci/execution";
import {
	createArtifact,
	PipelineStepResultSchema,
	parseRelativePath,
	shellQuote,
} from "@hobo/ci/execution";
import { CommandEnvelopeSchema } from "./_generated/readiness_pb.js";

type RunnerOptions = Parameters<CiContext["runner"]>[0];
export interface CloudflareBackendOptions {
	readonly context: CiContext;
	/** Must terminate the owning Workflow/sandbox and resolve only after stopping it. */
	readonly terminate: (
		reason: Exclude<CloseReason, "completed">,
	) => Promise<void>;
	/** Independent controller acknowledgment that Workflow/sandbox work stopped. */
	readonly verifyShutdown?: () => Promise<boolean>;
}
const CAPABILITIES: readonly PipelineCapability[] = Object.freeze([
	"commands",
	"artifacts",
	"cancellation",
]);
const MAX_LOG_BYTES = 3 * 1024 * 1024;

async function text(
	log: string | ReadableStream<Uint8Array>,
	signal: AbortSignal,
): Promise<string> {
	signal.throwIfAborted();
	if (!(log instanceof ReadableStream)) {
		if (new TextEncoder().encode(log).byteLength > MAX_LOG_BYTES)
			throw new Error("Cloudflare runner output exceeded bound");
		return log;
	}
	const reader = log.getReader();
	const decoder = new TextDecoder();
	const chunks: string[] = [];
	let bytes = 0;
	const abort = () => {
		void reader.cancel("pipeline aborted").catch(() => undefined);
	};
	signal.addEventListener("abort", abort, { once: true });
	try {
		while (true) {
			signal.throwIfAborted();
			const chunk = await reader.read();
			if (chunk.done) break;
			bytes += chunk.value.byteLength;
			if (bytes > MAX_LOG_BYTES) {
				await reader.cancel("output exceeded bound");
				throw new Error("Cloudflare runner output exceeded bound");
			}
			chunks.push(decoder.decode(chunk.value, { stream: true }));
		}
		signal.throwIfAborted();
		chunks.push(decoder.decode());
		return chunks.join("");
	} finally {
		signal.removeEventListener("abort", abort);
		reader.releaseLock();
	}
}
function bytes(encoded: string): Uint8Array {
	if (
		!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
			encoded,
		)
	)
		throw new Error("invalid Cloudflare command encoding");
	return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
}

/**
 * Capture the real command status while allowing Cloudflare to persist its snapshot.
 * Workflow retries are disabled separately: this wrapper never retries a command.
 */
export function cloudflareCommand(argv: readonly string[]): string {
	const command = argv.map(shellQuote).join(" ");
	return `set +e\nhobo_tmp=$(mktemp -d) || exit 70\n${command} >"$hobo_tmp/stdout" 2>"$hobo_tmp/stderr"\nhobo_status=$?\nprintf '{"exitCode":%s,"stdoutBase64":"' "$hobo_status"\nbase64 <"$hobo_tmp/stdout" | tr -d '\\n'\nprintf '","stderrBase64":"'\nbase64 <"$hobo_tmp/stderr" | tr -d '\\n'\nprintf '"}\\n'\nrm -rf "$hobo_tmp"\n`;
}

/** Binds the native SDK context supplied by a Cloudflare CIWorkflow. */
export function createCloudflareBackend(
	options: CloudflareBackendOptions,
): PipelineBackend {
	return {
		kind: "cf",
		capabilities: CAPABILITIES,
		async open(pipeline, openingSignal) {
			openingSignal.throwIfAborted();
			let previous: CiRunnerResult | undefined;
			let closed = false;
			let closeTask: Promise<void> | undefined;
			let busy = false;
			let stopRequired = false;
			let artifactIndex = 0;
			const deadline = Date.now() + pipeline.timeoutSeconds * 1000;
			const privateRoot = `.hobo-ci-workspaces/${pipeline.id}`;
			function workspaceCommand(
				argv: readonly string[],
				cwd: string,
				env: { [name: string]: string },
			): string {
				const quotedRoot = shellQuote(privateRoot);
				const initialize =
					previous === undefined
						? `test ! -e .hobo-ci-workspaces && test ! -L .hobo-ci-workspaces || exit 73
mkdir -m 700 .hobo-ci-workspaces
mkdir -m 700 ${quotedRoot}
hobo_archive=$(mktemp) || exit 70
trap 'rm -f "$hobo_archive"' EXIT
tar --exclude='./.hobo-ci-workspaces' -cf "$hobo_archive" .
tar -xf "$hobo_archive" -C ${quotedRoot}
rm -f "$hobo_archive"
trap - EXIT`
						: `test -d ${quotedRoot} && test ! -L .hobo-ci-workspaces && test ! -L ${quotedRoot} || exit 73`;
				const directory = cwd === "." ? privateRoot : `${privateRoot}/${cwd}`;
				const environment = Object.entries(env)
					.map(([name, value]) => shellQuote(`${name}=${value}`))
					.join(" ");
				const script = `set -e
${initialize}
hobo_root=$(cd ${quotedRoot} && pwd -P)
cd ${shellQuote(directory)}
case "$(pwd -P)/" in "$hobo_root/"*) ;; *) exit 65 ;; esac
exec env ${environment} ${argv.map(shellQuote).join(" ")}`;
				return cloudflareCommand(["sh", "-c", script]);
			}

			async function invoke(
				name: string,
				command: string,
				cwd: string,
				env: { [name: string]: string },
				signal: AbortSignal,
			) {
				signal.throwIfAborted();
				if (closed || busy) throw new Error("Cloudflare session unavailable");
				busy = true;
				stopRequired = true;
				try {
					const remaining = Math.max(1, deadline - Date.now());
					const request: RunnerOptions = {
						name,
						command,
						cwd,
						env,
						config: {
							retries: { limit: 0, delay: 0 },
							timeout: remaining + 10000,
							commandTimeoutMs: remaining,
						},
					};
					const result = await (previous
						? previous.runner(request)
						: options.context.runner(request));
					previous = result;
					const [stdout, stderr] = await Promise.all([
						text(result.logs.stdout, signal),
						text(result.logs.stderr, signal),
					]);
					stopRequired = false;
					if (result.exitCode !== 0)
						throw new Error("Cloudflare wrapper failed");
					if (stderr.trim())
						throw new Error("Cloudflare wrapper wrote unexpected diagnostics");
					if (
						!["exitCode", "stdoutBase64", "stderrBase64"].every((field) =>
							stdout.includes(`"${field}":`),
						)
					)
						throw new Error("incomplete Cloudflare command envelope");
					const parsed = fromJsonString(CommandEnvelopeSchema, stdout);
					if (
						!Number.isInteger(parsed.exitCode) ||
						parsed.exitCode < 0 ||
						parsed.exitCode > 255
					)
						throw new Error("invalid Cloudflare command status");
					return {
						exitCode: parsed.exitCode,
						stdout: new TextDecoder().decode(bytes(parsed.stdoutBase64)),
						stderr: new TextDecoder().decode(bytes(parsed.stderrBase64)),
					};
				} finally {
					busy = false;
				}
			}
			return {
				async run(step, signal) {
					const result = await invoke(
						`hobo-${pipeline.id}-${step.id}`,
						workspaceCommand(step.argv, step.cwd, {
							...step.env,
							HOBO_CI_EXECUTION_ID: pipeline.id,
						}),
						".",
						{},
						signal,
					);
					return create(PipelineStepResultSchema, { id: step.id, ...result });
				},
				async artifact(path, signal) {
					parseRelativePath(path);
					const parts = path.split("/");
					const prefixes = parts
						.map((_part, index) =>
							shellQuote(parts.slice(0, index + 1).join("/")),
						)
						.join(" ");
					const safe = shellQuote(path);
					const script = `for hobo_part in ${prefixes}; do test ! -L "$hobo_part" || exit 65; done\ntest -f ${safe} || exit 66\nhobo_size=$(wc -c < ${safe}) || exit 70\ntest "$hobo_size" -le 1048576 || exit 75\nbase64 < ${safe}`;
					const result = await invoke(
						`hobo-${pipeline.id}-artifact-${artifactIndex++}`,
						workspaceCommand(["sh", "-c", script], ".", {}),
						".",
						{},
						signal,
					);
					if (result.exitCode !== 0)
						throw new Error("Cloudflare artifact unavailable");
					return createArtifact(
						path,
						bytes(result.stdout.replaceAll(/\s/g, "")),
					);
				},
				close(reason) {
					if (closeTask) return closeTask;
					closed = true;
					closeTask = (async () => {
						// A successful invocation has completed and the SDK drained its snapshots/logs.
						if (!stopRequired) return;
						await options.terminate(
							reason === "completed" ? "cancelled" : reason,
						);
						if (!options.verifyShutdown || !(await options.verifyShutdown()))
							throw new Error("Cloudflare shutdown not confirmed");
					})();
					return closeTask;
				},
			};
		},
	};
}
