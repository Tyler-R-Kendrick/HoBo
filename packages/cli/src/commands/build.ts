import { BuildError, remediationFor } from "../build/errors.js";
import { parseBuildRequestFromInvocation } from "../build/parse.js";
import { type RunBuildOptions, runBuild } from "../build/run-build.js";
import type { CommandModule } from "../shell/registry.js";

export { BuildCliError, BuildError } from "../build/errors.js";
export {
	type BuildRequest,
	type BuildResult,
	parseBuildManifest,
	parseBuildRequestFromInvocation,
	parseServiceDeclaration,
} from "../build/parse.js";
export {
	BUILD_MANIFEST_PATH,
	runBuild,
	writeBuildFixtureProject,
} from "../build/run-build.js";

export function createBuildCommand(
	options: Pick<
		RunBuildOptions,
		| "componentize"
		| "realComponentizeFactory"
		| "requireRealComponentize"
		| "containerBuild"
	> = {},
): CommandModule {
	return {
		run: async ({ context, flags }) => {
			try {
				const request = parseBuildRequestFromInvocation(
					context,
					flags,
					process.env,
				);
				const result = await runBuild({ ...request, ...options });
				return {
					ok: true,
					status: "ok",
					code: "HOBO_OK",
					message: `hobo build ok (${result.artifacts.length} artifacts)`,
					data: {
						command: "build",
						manifest: result.manifest,
						manifestDigest: result.manifestDigest,
						runtimeTarget: request.targetRuntime,
						artifacts: result.artifacts,
					},
				};
			} catch (error) {
				if (error instanceof BuildError) {
					return {
						ok: false,
						status: "error",
						code: error.code,
						message: error.message,
						remediation: remediationFor(error),
						data: { detail: error.detail },
					};
				}
				throw error;
			}
		},
	};
}
