// @ts-nocheck
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { BuildError } from "./errors.js";

type CodegenContract = {
	compareGeneratedTree: (projectRoot: string, artifacts: unknown) => Promise<unknown[]>;
	generateCodegenArtifacts: (input: {
		projectRoot: string;
		guestLanguage: string;
	}) => Promise<unknown>;
	writeFixtureProject: (projectRoot: string, options?: Record<string, unknown>) => Promise<void>;
};

let codegenContract: CodegenContract | null = null;

async function loadCodegenContract(): Promise<CodegenContract> {
	if (!codegenContract) {
		const modulePath = join(
			dirname(fileURLToPath(import.meta.url)),
			"..",
			"..",
			"..",
			"..",
			"src",
			"draft",
			"technical-proofs",
			"hobo-codegen-cli-contract",
			"src",
			"codegen-cli-contract.js",
		);
		codegenContract = (await import(pathToFileURL(modulePath).href)) as CodegenContract;
	}
	return codegenContract;
}

export async function assertGeneratedFresh(projectRoot: string): Promise<void> {
	const { compareGeneratedTree, generateCodegenArtifacts } = await loadCodegenContract();
	const artifacts = await generateCodegenArtifacts({ projectRoot, guestLanguage: "ts" });
	const drift = await compareGeneratedTree(projectRoot, artifacts);
	if (drift.length > 0) {
		throw new BuildError(
			"HOBO_BUILD_CODEGEN_DRIFT",
			"generated tree drift detected; run hobo codegen to refresh _generated/",
			{ drift },
		);
	}
}

export async function writeCodegenFixtureProject(
	projectRoot: string,
	options: Record<string, unknown> = {},
): Promise<void> {
	const { writeFixtureProject } = await loadCodegenContract();
	await writeFixtureProject(projectRoot, options);
}
