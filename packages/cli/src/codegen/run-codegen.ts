// @ts-nocheck
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The `hobo codegen` verb regenerates a project's checked-in `_generated/`
// tree from its WIT/Zod/allow/bindle sources through the codegen-cli contract
// (the same generator the build gate asserts freshness against, so a green
// `hobo codegen` and a green `hobo build` agree by construction).

type CodegenArtifact = { path: string; content: string };
type CodegenResult = {
	mode: "write" | "check";
	drift: boolean;
	checked: readonly string[];
	written: readonly string[];
};

type CodegenContract = {
	executeCodegenRequest: (request: {
		projectRoot: string;
		check: boolean;
		guestLanguage: string;
		engine: (options: {
			projectRoot: string;
			guestLanguage: string;
		}) => Promise<CodegenArtifact[]>;
	}) => Promise<CodegenResult>;
	generateCodegenArtifacts: (options: {
		projectRoot: string;
		guestLanguage: string;
	}) => Promise<CodegenArtifact[]>;
};

let contract: CodegenContract | null = null;

async function loadContract(): Promise<CodegenContract> {
	if (!contract) {
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
		contract = (await import(
			pathToFileURL(modulePath).href
		)) as CodegenContract;
	}
	return contract;
}

export interface CodegenRequest {
	readonly projectRoot: string;
	readonly check: boolean;
}

export async function runCodegen(
	request: CodegenRequest,
): Promise<CodegenResult> {
	const { executeCodegenRequest, generateCodegenArtifacts } =
		await loadContract();
	return executeCodegenRequest({
		projectRoot: resolve(request.projectRoot),
		check: request.check,
		guestLanguage: "ts",
		engine: generateCodegenArtifacts,
	});
}

/** True for the contract's drift error, whose `.code` starts `HOBO_CODEGEN`. */
export function isCodegenError(
	error: unknown,
): error is Error & { code: string; detail?: unknown } {
	return (
		error instanceof Error &&
		typeof (error as { code?: unknown }).code === "string" &&
		(error as { code: string }).code.startsWith("HOBO_CODEGEN")
	);
}
