// The project codegen engine behind `hobo codegen`/`hobo stub` and the
// `hobo build` freshness gate. Record types (artifacts, drift entries,
// reports, trainable stubs) are the GENERATED protobuf types from
// data-models/project_codegen.proto — re-exported here, never redeclared.
// This module declares only the behavioral/config surface: the engine
// interface, its layout (every output path and generated-import specifier is
// configuration with overridable defaults), and the error type.

export type {
	CodegenArtifact,
	CodegenReport,
	DriftEntry,
	TrainableStub,
} from "../_generated/project_codegen_pb.js";
export {
	CodegenArtifactSchema,
	CodegenReportSchema,
	DriftEntrySchema,
	TrainableStubSchema,
} from "../_generated/project_codegen_pb.js";

import type { CodegenArtifact } from "../_generated/project_codegen_pb.js";

/** Project-relative locations of the four codegen source files. */
export interface CodegenSourceLayout {
	readonly wit: string;
	readonly zod: string;
	readonly allow: string;
	readonly bindle: string;
}

/** Project-relative output path of every generated file. */
export interface CodegenGeneratedFiles {
	readonly manifest: string;
	readonly apiTree: string;
	readonly bindings: string;
	readonly hooks: string;
	readonly steps: string;
	readonly workflows: string;
	readonly withOptions: string;
	readonly trainables: string;
}

/** Module specifiers emitted into generated code. */
export interface CodegenGeneratedImports {
	/** The runtime package generated trainable stubs import `training` from. */
	readonly runtimeModule: string;
	/** How generated modules reference the generated bindings module. */
	readonly bindingsSpecifier: string;
}

/** Where an engine reads sources from and what it writes where. */
export interface CodegenLayout {
	readonly sources: CodegenSourceLayout;
	/** Roots the engine owns; tree write/compare operate on these. */
	readonly generatedRoots: readonly string[];
	readonly files: CodegenGeneratedFiles;
	readonly imports: CodegenGeneratedImports;
}

/**
 * A codegen engine: generates the full artifact set for a project. The
 * layout rides along so tree operations (write, drift-compare) and code
 * emission know the engine's paths without any shared global.
 */
export interface CodegenEngine {
	readonly layout: CodegenLayout;
	generate(projectRoot: string): Promise<readonly CodegenArtifact[]>;
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

/** The conventional HoBo project layout; override any part per engine. */
export function defaultCodegenLayout(): CodegenLayout {
	return {
		sources: {
			wit: ".hobo/sources/wit/sdk.wit",
			zod: ".hobo/sources/zod/resources.json",
			allow: ".hobo/sources/allow/scopes.json",
			bindle: "hobo.bindle.json",
		},
		generatedRoots: [".hobo/generated", "src/_generated"],
		files: {
			manifest: ".hobo/generated/codegen-manifest.json",
			apiTree: "src/_generated/api-tree.d.ts",
			bindings: "src/_generated/bindings.d.ts",
			hooks: "src/_generated/hooks.d.ts",
			steps: "src/_generated/steps.d.ts",
			workflows: "src/_generated/workflows.d.ts",
			withOptions: "src/_generated/with-options.d.ts",
			trainables: "src/_generated/trainables.ts",
		},
		imports: {
			runtimeModule: "@hobo/runtime",
			bindingsSpecifier: "./bindings.js",
		},
	};
}
