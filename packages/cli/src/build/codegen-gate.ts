import { toJson } from "@bufbuild/protobuf";
import { createProjectCodegenEngine } from "../codegen/engine.js";
import {
	type CodegenFixtureOptions,
	writeFixtureProject,
} from "../codegen/fixture.js";
import { compareGeneratedTree } from "../codegen/tree.js";
import { type CodegenEngine, DriftEntrySchema } from "../codegen/types.js";
import { BuildError } from "./errors.js";

/**
 * The build-time freshness gate: `hobo build` refuses to package a project
 * whose checked-in generated tree has drifted from its sources. Uses the
 * same (injectable) engine as `hobo codegen`, so the two agree by
 * construction.
 */
export async function assertGeneratedFresh(
	projectRoot: string,
	engine: CodegenEngine = createProjectCodegenEngine(),
): Promise<void> {
	const artifacts = await engine.generate(projectRoot);
	const drift = await compareGeneratedTree(
		projectRoot,
		artifacts,
		engine.layout.generatedRoots,
	);
	if (drift.length > 0) {
		throw new BuildError(
			"HOBO_BUILD_CODEGEN_DRIFT",
			"generated tree drift detected; run hobo codegen to refresh _generated/",
			{ drift: drift.map((entry) => toJson(DriftEntrySchema, entry)) },
		);
	}
}

export async function writeCodegenFixtureProject(
	projectRoot: string,
	options: CodegenFixtureOptions = {},
): Promise<void> {
	await writeFixtureProject(projectRoot, options);
}
