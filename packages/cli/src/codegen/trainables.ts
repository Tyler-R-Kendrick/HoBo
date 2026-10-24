import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, posix, relative } from "node:path";

import { create } from "@bufbuild/protobuf";
import {
	type DeclaredTrainableClass,
	generateDeclaredRegistrations,
	scanDeclaredTrainables,
} from "ts-autocode-grounding";
import { discoverInSource } from "ts-autocode-training";
import type {
	SourceModel,
	SourceModelBindle,
	SourceModelResource,
} from "./engine.js";
import {
	type CodegenArtifact,
	CodegenArtifactSchema,
	CodegenError,
	type CodegenLayout,
	type TrainableStub,
	TrainableStubSchema,
} from "./types.js";

// Trainable codegen (ADR-0125 / generated-stack.md). Generated here:
// contract-backed `training.define()` stubs for every bindle step (a semantic
// function until promotion); inferred `training.infer()` registrations for
// bare `"use training"` markers found in authored source (syntax 3 — the
// marker carries no bindings; codegen generates them); and, for an ambient
// `@trainable declare class` (Plan 2 Syntax 0), the `defineGrounding(...)`
// registrations ts-autocode-grounding's emitter writes (ADR-0128), one module
// per class beside the trainables module, re-exported from it. Output paths
// and module specifiers all come from the layout config; record shapes are
// the generated hobo.cli.v1 proto types.

/** An exported function carrying the bare `"use training"` prologue. */
export interface DirectiveFunction {
	readonly name: string;
	/** Project-relative source file (posix separators). */
	readonly file: string;
}

/**
 * The directive is a prologue (first statement of the function body).
 * Discovery delegates to ts-autocode-training's AST walk (ADR-0128):
 * exported free functions whose first statement is the `"use training"`
 * string literal — robust against brace-bearing parameter/return type
 * annotations, comments, and directive-like strings elsewhere.
 */
function directiveFunctionNames(source: string): readonly string[] {
	const names = new Set<string>();
	for (const target of discoverInSource(source)) {
		if (target.className === undefined && target.exported) {
			names.add(target.methodName);
		}
	}
	return [...names];
}

/** The layout's TypeScript sources, in a deterministic order, generated roots excluded. */
async function scannedSources(
	projectRoot: string,
	layout: CodegenLayout,
): Promise<readonly string[]> {
	const scanRoot = join(projectRoot, layout.sources.scanDir);
	if (!existsSync(scanRoot)) return [];
	const excluded = layout.generatedRoots.map((root) => join(projectRoot, root));

	const files: string[] = [];
	async function visit(directory: string): Promise<void> {
		if (excluded.some((root) => directory.startsWith(root))) return;
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(path);
				continue;
			}
			if (/\.(ts|tsx|mts)$/.test(entry.name)) files.push(path);
		}
	}
	await visit(scanRoot);
	return files.sort();
}

function projectPath(projectRoot: string, file: string): string {
	return relative(projectRoot, file).split("\\").join("/");
}

/**
 * Scan the layout's source dir for `"use training"`-marked exported
 * functions (deterministic file order; generated roots excluded).
 */
export async function scanTrainableDirectives(
	projectRoot: string,
	layout: CodegenLayout,
): Promise<readonly DirectiveFunction[]> {
	const found: DirectiveFunction[] = [];
	for (const file of await scannedSources(projectRoot, layout)) {
		const source = await readFile(file, "utf8");
		for (const name of directiveFunctionNames(source)) {
			found.push({ name, file: projectPath(projectRoot, file) });
		}
	}
	return found;
}

/** An ambient `@trainable declare class` found in authored source. */
export interface AmbientTrainableClass {
	/** Project-relative source file (posix separators). */
	readonly file: string;
	readonly declared: DeclaredTrainableClass;
}

/**
 * Only a file with an ambient class and one of the scanner's marker decorators
 * is parsed: the scanner also walks classes with bodies, and refuses some of
 * them (overloads), which register themselves and are none of codegen's business.
 */
const MARKER_DECORATOR = /@(?:trainable|component)\b/u;
const AMBIENT_CLASS = /\bdeclare\s+(?:abstract\s+)?class\b/u;

/**
 * Scan the layout's source dir for ambient `@trainable declare class`
 * declarations (Plan 2 Syntax 0). An ambient class is erased at compile time,
 * so no decorator ever registers it; codegen emits its registrations instead.
 * A decorated class with a body registers itself when it is evaluated, so it
 * is not ambient and is left out. Scanning is ts-autocode-grounding's AST walk
 * (ADR-0128); a class it refuses (an overloaded or non-identifier method
 * name), or two ambient classes of one name, is a codegen error.
 */
export async function scanAmbientTrainableClasses(
	projectRoot: string,
	layout: CodegenLayout,
): Promise<readonly AmbientTrainableClass[]> {
	const found: AmbientTrainableClass[] = [];
	for (const path of await scannedSources(projectRoot, layout)) {
		const source = await readFile(path, "utf8");
		if (!MARKER_DECORATOR.test(source) || !AMBIENT_CLASS.test(source)) continue;
		const file = projectPath(projectRoot, path);
		let classes: readonly DeclaredTrainableClass[];
		try {
			classes = scanDeclaredTrainables(source);
		} catch (error) {
			throw new CodegenError(
				"HOBO_CODEGEN_SOURCE_PARSE",
				`Cannot scan ${file} for @trainable classes: ${error instanceof Error ? error.message : error}`,
				{ file },
			);
		}
		for (const declared of classes) {
			if (!declared.ambient) continue;
			const earlier = found.find(
				(entry) => entry.declared.className === declared.className,
			);
			if (earlier !== undefined) {
				throw new CodegenError(
					"HOBO_CODEGEN_SOURCE_PARSE",
					`Ambient @trainable class ${declared.className} is declared in both ${earlier.file} and ${file}; its method refs would collide`,
					{ file, className: declared.className, earlier: earlier.file },
				);
			}
			found.push({ file, declared });
		}
	}
	return found;
}

export interface TrainablesBuild {
	readonly artifact: CodegenArtifact;
	/** One registration module per ambient @trainable class, beside `artifact`. */
	readonly declaredArtifacts: readonly CodegenArtifact[];
	readonly stubs: readonly TrainableStub[];
}

interface TrainableStepEntry {
	readonly stub: TrainableStub;
	readonly code: string;
}

interface TrainableDirectiveEntry extends TrainableStepEntry {
	readonly importLine: string;
}

export function buildTrainables(
	model: SourceModel,
	layout: CodegenLayout,
	directives: readonly DirectiveFunction[] = [],
	ambient: readonly AmbientTrainableClass[] = [],
): TrainablesBuild {
	const stepEntries = model.bindles.flatMap((bindle) =>
		bindle.steps.map((step) => toStepEntry(model, bindle, step)),
	);
	const directiveEntries = directives.map((directive) =>
		toDirectiveEntry(directive, layout),
	);
	const declaredModules = ambient.map((entry) =>
		toDeclaredModule(entry, layout),
	);
	const declaredEntries = declaredModules.flatMap((module) => module.entries);
	const entries = [...stepEntries, ...directiveEntries];
	refuseCollidingExports(
		entries.map((entry) => entry.stub),
		declaredEntries.map((entry) => entry.stub),
	);
	const stubs = [...entries, ...declaredEntries].map((entry) => entry.stub);
	const usedTypes = [
		...new Set(stepEntries.map((entry) => entry.stub.typeName)),
	].sort();

	const header =
		`// Generated by hobo codegen — do not edit.\n` +
		`// Trainable bindings (ADR-0125): contract-backed training.define() stubs\n` +
		`// per bindle step, plus inferred training.infer() registrations generated\n` +
		`// from bare "use training" markers in authored source. Stubs serve their\n` +
		`// contract example until a training artifact is applied\n` +
		`// (applyTrainingArtifact) and can be reverted with null.\n` +
		`import { training } from ${JSON.stringify(layout.imports.runtimeModule)};\n` +
		(usedTypes.length > 0
			? `import type { ${usedTypes.join(", ")} } from ${JSON.stringify(layout.imports.bindingsSpecifier)};\n`
			: "") +
		directiveEntries.map((entry) => entry.importLine).join("");

	const defines = entries.map((entry) => entry.code).join("\n");
	const reexports =
		declaredEntries.length > 0
			? `\n// Ambient @trainable classes: their registrations are generated beside\n` +
				`// this module (declared/<Class>.ts) and re-exported here, so importing it\n` +
				`// registers them.\n` +
				declaredEntries.map((entry) => entry.reexport).join("")
			: "";

	const manifest =
		`export const trainableStubs = [\n` +
		`${stubs
			.map(
				(stub) =>
					`  { methodRef: ${JSON.stringify(stub.methodRef)}, exportName: ${JSON.stringify(stub.exportName)}, origin: ${JSON.stringify(stub.origin)}, contractRef: ${JSON.stringify(stub.contractRef)} },`,
			)
			.join("\n")}\n` +
		`] as const;\n`;

	return {
		artifact: create(CodegenArtifactSchema, {
			path: layout.files.trainables,
			content: `${header}\n${defines}${reexports}\n${manifest}`,
		}),
		declaredArtifacts: declaredModules.map((module) => module.artifact),
		stubs,
	};
}

/**
 * A re-exported ambient operation must not take a name another entry exports
 * (`Incident.classify` and the step `incident.classify` both camelCase to
 * `incidentClassify`): the trainables module would not compile.
 */
function refuseCollidingExports(
	generated: readonly TrainableStub[],
	declared: readonly TrainableStub[],
): void {
	const seen = new Map(
		generated.map((stub) => [stub.exportName, stub.methodRef]),
	);
	for (const stub of declared) {
		const earlier = seen.get(stub.exportName);
		if (earlier !== undefined) {
			throw new CodegenError(
				"HOBO_CODEGEN_SOURCE_PARSE",
				`Trainables ${earlier} and ${stub.methodRef} both generate the export ${stub.exportName}`,
				{ exportName: stub.exportName, methodRefs: [earlier, stub.methodRef] },
			);
		}
		seen.set(stub.exportName, stub.methodRef);
	}
}

function toStepEntry(
	model: SourceModel,
	bindle: SourceModelBindle,
	step: string,
): TrainableStepEntry {
	const resource =
		model.resources.find((candidate) =>
			step.startsWith(`${candidate.name}.`),
		) ?? model.resources[0];
	if (!resource) {
		throw new Error(`no resource available for bindle step "${step}"`);
	}

	const stub = create(TrainableStubSchema, {
		methodRef: step,
		exportName: camelCase(step),
		resource: resource.name,
		typeName: resource.typeName,
		contractRef: `bindle://${bindle.name}/steps/${step}`,
		origin: "bindle-step",
	});

	const example = exampleLiteral(resource);
	const code =
		`export const ${stub.exportName} = training.define<${resource.typeName}, ${resource.typeName}>({\n` +
		`  methodRef: ${JSON.stringify(step)},\n` +
		`  intent: ${JSON.stringify(
			`Implement bindle step "${step}" over resource "${resource.name}" (${bindle.provider} provider).`,
		)},\n` +
		`  contract: {\n` +
		`    ref: ${JSON.stringify(stub.contractRef)},\n` +
		`    examples: [{ input: ${example}, output: ${example} }],\n` +
		`  },\n` +
		`  rubric: { exactMatch: 1 },\n` +
		`});\n`;

	return { stub, code };
}

function toDirectiveEntry(
	directive: DirectiveFunction,
	layout: CodegenLayout,
): TrainableDirectiveEntry {
	const stub = create(TrainableStubSchema, {
		methodRef: directive.name,
		exportName: `${directive.name}Training`,
		contractRef: `inferred://${directive.name}`,
		origin: "directive",
	});

	const fromDir = posix.dirname(layout.files.trainables);
	const specifier = posix
		.relative(fromDir, directive.file.replace(/\.(ts|tsx|mts)$/, ".js"))
		.replace(/^(?!\.)/, "./");

	return {
		stub,
		importLine: `import { ${directive.name} } from ${JSON.stringify(specifier)};\n`,
		code:
			`// Inferred bindings for the bare "use training" marker in ${directive.file}.\n` +
			`export const ${stub.exportName} = training.infer(${directive.name});\n`,
	};
}

interface DeclaredEntry {
	readonly stub: TrainableStub;
	readonly reexport: string;
}

interface DeclaredModule {
	readonly artifact: CodegenArtifact;
	readonly entries: readonly DeclaredEntry[];
}

/**
 * The registration module for one ambient class, written by
 * ts-autocode-grounding's emitter: one `export const <method> =
 * defineGrounding({...})` per operation, `defineGrounding` imported from the
 * layout's runtime module (`@hobo/runtime`'s is `training.define`). Every
 * identity in it is derived from the scanned class and method names. The
 * trainables module re-exports each operation as `<class><Method>`, the
 * camelCase of its methodRef, as a bindle step's stub is named.
 */
function toDeclaredModule(
	ambient: AmbientTrainableClass,
	layout: CodegenLayout,
): DeclaredModule {
	const { declared, file } = ambient;
	const fromDir = posix.dirname(layout.files.trainables);
	const path = posix.join(fromDir, "declared", `${declared.className}.ts`);
	const specifier = `./${posix.relative(fromDir, path).replace(/\.ts$/u, ".js")}`;
	const artifact = create(CodegenArtifactSchema, {
		path,
		content: generateDeclaredRegistrations(declared, {
			runtimeModule: layout.imports.runtimeModule,
			header: [
				"// Generated by hobo codegen — do not edit.",
				`// Registrations for the ambient @trainable class ${declared.className} in ${file}`,
				"// (Plan 2 Syntax 0, ADR-0128): signature-only, served by the stub baseline.",
			],
		}),
	});
	const entries = declared.operations.map((operation) => {
		const stub = create(TrainableStubSchema, {
			methodRef: operation.methodRef,
			exportName: camelCase(operation.methodRef),
			contractRef: operation.contractRef,
			origin: "declared",
		});
		return {
			stub,
			reexport: `export { ${operation.method} as ${stub.exportName} } from ${JSON.stringify(specifier)};\n`,
		};
	});
	return { artifact, entries };
}

/** The deterministic example object literal for a resource's fields. */
function exampleLiteral(resource: SourceModelResource): string {
	const fields = resource.fields
		.map(
			(field) =>
				`${JSON.stringify(field.name)}: ${JSON.stringify(field.example)}`,
		)
		.join(", ");
	return `{ ${fields} }`;
}

function camelCase(value: string): string {
	const parts = value.split(/[^a-zA-Z0-9]+/).filter(Boolean);
	return parts
		.map((part, index) =>
			index === 0
				? part.charAt(0).toLowerCase() + part.slice(1)
				: part.charAt(0).toUpperCase() + part.slice(1),
		)
		.join("");
}
