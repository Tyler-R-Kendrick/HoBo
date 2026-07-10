// The project codegen engine behind `hobo codegen` and the `hobo build`
// freshness gate (promoted from the hobo-codegen-cli-contract draft proof;
// see docs/design/proofs/hobo-152-codegen-cli). Everything is injectable:
// consumers depend on the CodegenEngine interface, and the layout the engine
// reads/writes is configuration, not hardcoded paths.

/** One generated file, project-root-relative. */
export interface CodegenArtifact {
	readonly path: string;
	readonly content: string;
}

/** Project-relative locations of the four codegen source files. */
export interface CodegenSourceLayout {
	readonly wit: string;
	readonly zod: string;
	readonly allow: string;
	readonly bindle: string;
}

/** Where an engine reads sources from and owns generated output. */
export interface CodegenLayout {
	readonly sources: CodegenSourceLayout;
	readonly generatedRoots: readonly string[];
}

/**
 * A codegen engine: generates the full artifact set for a project. The
 * layout rides along so tree operations (write, drift-compare) know which
 * roots the engine owns without any shared global.
 */
export interface CodegenEngine {
	readonly layout: CodegenLayout;
	generate(projectRoot: string): Promise<readonly CodegenArtifact[]>;
}

export interface CodegenReport {
	readonly mode: "write" | "check";
	readonly written: readonly string[];
	readonly checked: readonly string[];
}

export interface DriftEntry {
	readonly path: string;
	readonly status: "extra" | "missing" | "changed";
	readonly expectedDigest?: string;
	readonly actualDigest?: string;
}

export class CodegenError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly detail: Record<string, unknown> = {},
	) {
		super(message);
		this.name = "CodegenError";
	}
}

/** The conventional HoBo project layout; override per engine when needed. */
export function defaultCodegenLayout(): CodegenLayout {
	return {
		sources: {
			wit: ".hobo/sources/wit/sdk.wit",
			zod: ".hobo/sources/zod/resources.json",
			allow: ".hobo/sources/allow/scopes.json",
			bindle: "hobo.bindle.json",
		},
		generatedRoots: [".hobo/generated", "src/_generated"],
	};
}
