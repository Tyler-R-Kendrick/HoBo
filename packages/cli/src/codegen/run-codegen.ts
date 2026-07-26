import { resolve } from "node:path";

import { create, toJson } from "@bufbuild/protobuf";
import { createProjectCodegenEngine } from "./engine.js";
import { compareGeneratedTree, writeGeneratedTree } from "./tree.js";
import {
	type CodegenEngine,
	CodegenError,
	type CodegenReport,
	CodegenReportSchema,
	DriftEntrySchema,
} from "./types.js";

export interface CodegenRequest {
	readonly projectRoot: string;
	readonly check: boolean;
}

export interface CodegenDependencies {
	readonly engine?: CodegenEngine;
}

/**
 * Run codegen for a project: regenerate the artifact set and either write it
 * into the tree or (check mode) diff against what's on disk, failing on
 * drift. The engine is injectable; the default reads the conventional
 * project layout.
 */
export async function runCodegen(
	request: CodegenRequest,
	deps: CodegenDependencies = {},
): Promise<CodegenReport> {
	const engine = deps.engine ?? createProjectCodegenEngine();
	const projectRoot = resolve(request.projectRoot);
	const artifacts = await engine.generate(projectRoot);
	const paths = artifacts.map((artifact) => artifact.path);

	if (request.check) {
		const drift = await compareGeneratedTree(
			projectRoot,
			artifacts,
			engine.layout.generatedRoots,
		);
		if (drift.length > 0) {
			throw new CodegenError(
				"HOBO_CODEGEN_DRIFT",
				"generated tree drift detected",
				{ drift: drift.map((entry) => toJson(DriftEntrySchema, entry)) },
			);
		}
		return create(CodegenReportSchema, { mode: "check", checked: paths });
	}

	await writeGeneratedTree(
		projectRoot,
		artifacts,
		engine.layout.generatedRoots,
	);
	return create(CodegenReportSchema, { mode: "write", written: paths });
}
