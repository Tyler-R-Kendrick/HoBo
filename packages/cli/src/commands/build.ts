import type { CommandModule } from "../shell/registry.js";
import { BuildError, remediationFor } from "../build/errors.js";
import { parseBuildRequestFromInvocation } from "../build/parse.js";
import { runBuild } from "../build/run-build.js";

export { runBuild, writeBuildFixtureProject, BUILD_MANIFEST_PATH } from "../build/run-build.js";
export { BuildError, BuildCliError } from "../build/errors.js";
export {
	parseBuildRequestFromInvocation,
	parseServiceDeclaration,
	parseBuildManifest,
	type BuildRequest,
	type BuildResult,
} from "../build/parse.js";

export function createBuildCommand(): CommandModule {
	return {
		run: async ({ context, flags }) => {
			try {
				const request = parseBuildRequestFromInvocation(context, flags, process.env);
				const result = await runBuild(request);
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
