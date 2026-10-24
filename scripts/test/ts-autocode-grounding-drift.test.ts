/**
 * Grounding drift gate for the ts-autocode submodule (ADR-0128, ADR-0169).
 *
 * `@hobo/runtime` registers what ts-autocode-grounding composes
 * (`GroundingOptions`) as its own `TrainingOptions`, and hands grounding the
 * decorator metadata it reads (packages/runtime/src/training/granular.ts). A
 * pin bump can rename one of those fields, make a required one optional,
 * retype it, or retype the metadata parameter. Each must stop granular.ts
 * compiling: a cast that lets it through registers a trainable whose identity
 * silently falls back to the function's own name, or whose intent is
 * undefined. This test compiles granular.ts with the runtime package's own
 * compiler options against the pinned grounding source, as it is and then with
 * each such change made in memory, and expects every changed compile to fail
 * in granular.ts. It needs the submodule checked out
 * (`pnpm run pins:fetch ts-autocode`), not built.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import ts from "typescript";

const root = join(import.meta.dirname, "../..");
const GROUNDING = join(root, "external/ts-autocode/packages/grounding/src");
const RUNTIME = join(root, "packages/runtime");
const GRANULAR = join(RUNTIME, "src/training/granular.ts");

interface Drift {
	readonly name: string;
	/** A file of ts-autocode-grounding's `src/`. */
	readonly file: string;
	/** Text that occurs exactly once in that file at the pin. */
	readonly from: string;
	readonly to: string;
}

const OPTIONS_HEAD = "export interface GroundingOptions {\n";
const SHAPE_HEAD = "export interface ShapeDescriptor {\n";

const DRIFTS: readonly Drift[] = [
	{
		name: "methodRef renamed",
		file: "decorators.ts",
		from: `${OPTIONS_HEAD}\treadonly methodRef: string;`,
		to: `${OPTIONS_HEAD}\treadonly id: string;`,
	},
	{
		name: "methodRef optional",
		file: "decorators.ts",
		from: `${OPTIONS_HEAD}\treadonly methodRef: string;`,
		to: `${OPTIONS_HEAD}\treadonly methodRef?: string;`,
	},
	{
		name: "intent renamed",
		file: "decorators.ts",
		from: "\treadonly intent: string;\n\treadonly contract: {",
		to: "\treadonly purpose: string;\n\treadonly contract: {",
	},
	{
		name: "intent optional",
		file: "decorators.ts",
		from: "\treadonly intent: string;\n\treadonly contract: {",
		to: "\treadonly intent?: string;\n\treadonly contract: {",
	},
	{
		name: "contract.ref retyped",
		file: "decorators.ts",
		from: "\treadonly contract: {\n\t\treadonly ref: string;",
		to: "\treadonly contract: {\n\t\treadonly ref: number;",
	},
	{
		name: "params retyped",
		file: "decorators.ts",
		from: "\treadonly params?: Record<string, FieldDescription>;\n\treadonly output?",
		to: "\treadonly params?: Record<string, string>;\n\treadonly output?",
	},
	{
		name: "a shape descriptor field that is not JSON",
		file: "decorators.ts",
		from: `${SHAPE_HEAD}\treadonly type: string;`,
		to: `${SHAPE_HEAD}\treadonly type: string;\n\treadonly validate: (value: unknown) => boolean;`,
	},
	{
		name: "granularOptionsFor's metadata parameter retyped",
		file: "decorators.ts",
		from: "\tmetadata: Record<PropertyKey, unknown> | undefined,\n\tmethodName: string,",
		to: "\tmetadata: ReadonlyMap<string, unknown> | undefined,\n\tmethodName: string,",
	},
	{
		name: "finalizeTrainableClass's metadata parameter retyped",
		file: "component.ts",
		from: "\tmetadata: Record<PropertyKey, unknown> | undefined,\n\tregistry: GroundingRegistry,",
		to: "\tmetadata: ReadonlyMap<string, unknown> | undefined,\n\tregistry: GroundingRegistry,",
	},
];

/** The runtime package's compiler options, with ts-autocode-grounding read from its source. */
function runtimeOptions(): ts.CompilerOptions {
	const parsed = ts.getParsedCommandLineOfConfigFile(
		join(RUNTIME, "tsconfig.json"),
		{},
		{
			...ts.sys,
			onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
				throw new Error(
					ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
				);
			},
		},
	);
	assert.ok(parsed, "packages/runtime/tsconfig.json parses");
	// Nothing is emitted, so the output layout (rootDir, which grounding's
	// source sits outside of) does not apply; every checking option does.
	const {
		rootDir: _rootDir,
		outDir: _outDir,
		declaration: _declaration,
		sourceMap: _sourceMap,
		...checking
	} = parsed.options;
	return {
		...checking,
		noEmit: true,
		paths: { "ts-autocode-grounding": [join(GROUNDING, "index.ts")] },
	};
}

/** granular.ts's diagnostics, with grounding's `src/<file>` replaced by `text` when given. */
function granularDiagnostics(
	options: ts.CompilerOptions,
	replaced?: { readonly file: string; readonly text: string },
	oldProgram?: ts.Program,
): { readonly messages: readonly string[]; readonly program: ts.Program } {
	const host = ts.createCompilerHost(options, true);
	if (replaced !== undefined) {
		const target = join(GROUNDING, replaced.file);
		const getSourceFile = host.getSourceFile.bind(host);
		const readFile = host.readFile.bind(host);
		host.getSourceFile = (fileName, language, onError, shouldCreate) =>
			resolve(fileName) === target
				? ts.createSourceFile(fileName, replaced.text, language, true)
				: getSourceFile(fileName, language, onError, shouldCreate);
		host.readFile = (fileName) =>
			resolve(fileName) === target ? replaced.text : readFile(fileName);
	}
	const program = ts.createProgram({
		rootNames: [GRANULAR],
		options,
		host,
		...(oldProgram === undefined ? {} : { oldProgram }),
	});
	const source = program.getSourceFile(GRANULAR);
	assert.ok(source, "granular.ts is part of the program");
	const messages = [
		...program.getSyntacticDiagnostics(source),
		...program.getSemanticDiagnostics(source),
	].map((diagnostic) => {
		const at =
			diagnostic.start === undefined
				? ""
				: `:${source.getLineAndCharacterOfPosition(diagnostic.start).line + 1}`;
		return `granular.ts${at} TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`;
	});
	return { messages, program };
}

describe("ts-autocode grounding drift", () => {
	it("the submodule is checked out at its pin", () => {
		assert.ok(
			existsSync(join(GROUNDING, "decorators.ts")),
			"external/ts-autocode is not checked out: run `pnpm run pins:fetch ts-autocode`",
		);
	});

	const options = runtimeOptions();
	const pinned = granularDiagnostics(options);

	it("granular.ts compiles against the pinned grounding source", () => {
		assert.deepEqual(pinned.messages, []);
	});

	for (const drift of DRIFTS) {
		it(`granular.ts stops compiling when ${drift.name}`, () => {
			const text = readFileSync(join(GROUNDING, drift.file), "utf8");
			assert.equal(
				text.split(drift.from).length,
				2,
				`grounding's src/${drift.file} no longer holds the text this drift changes exactly once; update the drift to the new source`,
			);
			const { messages } = granularDiagnostics(
				options,
				{ file: drift.file, text: text.replace(drift.from, drift.to) },
				pinned.program,
			);
			assert.notDeepEqual(
				messages,
				[],
				`granular.ts still compiles when ${drift.name}`,
			);
		});
	}
});
