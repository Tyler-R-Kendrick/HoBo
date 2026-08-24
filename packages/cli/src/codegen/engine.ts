import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { create } from "@bufbuild/protobuf";
import {
	digest,
	pascalCase,
	stableStringify,
	toStableValue,
	union,
} from "./text.js";
import { buildTrainables, scanTrainableDirectives } from "./trainables.js";
import {
	type CodegenArtifact,
	CodegenArtifactSchema,
	type CodegenEngine,
	CodegenError,
	type CodegenGeneratedImports,
	type CodegenLayout,
	type CodegenSourceLayout,
	defaultCodegenLayout,
} from "./types.js";
import { type JsonValue } from "../json.js";


// The default project codegen engine: reads the WIT/Zod/allow/bindle sources
// from the layout, normalizes them into a deterministic source model, and
// renders the checked-in `.d.ts` views plus the codegen manifest. Output is
// byte-compatible with the promoted hobo-codegen-cli-contract proof, so the
// golden build digests hold.

export interface ProjectCodegenEngineOptions {
	readonly layout?: CodegenLayout;
}

export function createProjectCodegenEngine(
	options: ProjectCodegenEngineOptions = {},
): CodegenEngine {
	const layout = options.layout ?? defaultCodegenLayout();

	return {
		layout,
		async generate(projectRoot: string): Promise<readonly CodegenArtifact[]> {
			const model = await loadSourceModel(projectRoot, layout.sources);
			const directives = await scanTrainableDirectives(projectRoot, layout);
			const { files, imports } = layout;
			const artifact = (path: string, content: string) =>
				create(CodegenArtifactSchema, { path, content });

			return [
				artifact(
					files.manifest,
					stableStringify({
						schema: "hobo.codegen-manifest/v1",
						generatedBy: "hobo codegen",
						guestLanguage: "ts",
						layout: layout.generatedRoots,
						sourceDigests: digestSources(model.rawSources),
						resources: model.resources.map((resource) => resource.name),
						scopes: model.scopes.map((scope) => scope.name),
						bindles: model.bindles.map((bindle) => bindle.name),
					}),
				),
				artifact(files.apiTree, renderApiTree(model, imports)),
				artifact(files.bindings, renderBindings(model)),
				artifact(files.hooks, renderHooks(model, imports)),
				artifact(files.steps, renderStepSignatures(model, imports)),
				artifact(files.workflows, renderWorkflowSignatures(model, imports)),
				artifact(files.withOptions, renderWithOptions(model)),
				buildTrainables(model, layout, directives).artifact,
			];
		},
	};
}

/**
 * Read and normalize a project's codegen sources into the deterministic
 * source model shared by the renderers and the `hobo stub` descriptor list.
 */
export async function loadSourceModel(
	projectRoot: string,
	sources: CodegenSourceLayout,
): Promise<SourceModel> {
	return normalizeSourceModel(
		await readProjectSources(projectRoot, sources),
		sources,
	);
}

interface ProjectSources {
	readonly wit: string;
	readonly zod: JsonValue;
	readonly allow: JsonValue;
	readonly bindle: JsonValue;
}

async function readProjectSources(
	projectRoot: string,
	sources: CodegenSourceLayout,
): Promise<ProjectSources> {
	return {
		wit: await readTextSource(projectRoot, sources.wit),
		zod: await readJsonSource(projectRoot, sources.zod),
		allow: await readJsonSource(projectRoot, sources.allow),
		bindle: await readJsonSource(projectRoot, sources.bindle),
	};
}

async function readTextSource(
	projectRoot: string,
	path: string,
): Promise<string> {
	try {
		return await readFile(join(projectRoot, path), "utf8");
	} catch (error) {
		throw new CodegenError(
			"HOBO_CODEGEN_SOURCE_PARSE",
			`Cannot read ${path}: ${error instanceof Error ? error.message : error}`,
			{ file: path },
		);
	}
}

async function readJsonSource(
	projectRoot: string,
	path: string,
): Promise<JsonValue> {
	const source = await readTextSource(projectRoot, path);
	try {
		return JSON.parse(source);
	} catch (error) {
		throw new CodegenError(
			"HOBO_CODEGEN_SOURCE_PARSE",
			`Cannot parse ${path}: ${error instanceof Error ? error.message : error}`,
			{ file: path },
		);
	}
}

// Raw JSON views (post-toStableValue everything is plain objects/arrays).
interface RawField {
	readonly type?: string;
	readonly values?: readonly string[];
}
interface RawZod {
	readonly resources?: Record<
		string,
		{ readonly fields?: Record<string, RawField> }
	>;
}
interface RawAllow {
	readonly scopes?: Record<string, { readonly grants?: readonly string[] }>;
}
interface RawBindle {
	readonly name: string;
	readonly provider: string;
	readonly resources?: readonly string[];
	readonly steps?: readonly string[];
	readonly workflows?: readonly string[];
	readonly with?: Record<string, readonly string[]>;
}
interface RawBindleFile {
	readonly bindles?: readonly RawBindle[];
}

export interface SourceModelField {
	readonly name: string;
	readonly type: string;
	/** Deterministic example value used for contract-backed trainable stubs. */
	readonly example: JsonValue;
}

export interface SourceModelResource {
	readonly name: string;
	readonly typeName: string;
	readonly fields: readonly SourceModelField[];
}

export interface SourceModelBindle {
	readonly name: string;
	readonly provider: string;
	readonly resources: readonly string[];
	readonly steps: readonly string[];
	readonly workflows: readonly string[];
	readonly with: readonly {
		readonly name: string;
		readonly values: readonly string[];
	}[];
}

export interface SourceModel {
	readonly rawSources: Record<string, string>;
	readonly resources: readonly SourceModelResource[];
	readonly scopes: readonly {
		readonly name: string;
		readonly grants: readonly string[];
	}[];
	readonly bindles: readonly SourceModelBindle[];
}

function normalizeSourceModel(
	sources: ProjectSources,
	layout: CodegenSourceLayout,
): SourceModel {
	const rawSources = {
		wit: sources.wit,
		zod: stableStringify(sources.zod),
		allow: stableStringify(sources.allow),
		bindle: stableStringify(sources.bindle),
	};

	assertValidWitSource(sources.wit, layout.wit);
	// SAFETY: `const zod = toStableValue(sources.zod) as RawZod;` is required at this I/O or test boundary.
	const zod = toStableValue(sources.zod) as RawZod;
	// SAFETY: `const allow = toStableValue(sources.allow) as RawAllow;` is required at this I/O or test boundary.
	const allow = toStableValue(sources.allow) as RawAllow;
	// SAFETY: `const bindle = toStableValue(sources.bindle) as RawBindleFile;` is required at this I/O or test boundary.
	const bindle = toStableValue(sources.bindle) as RawBindleFile;

	const resources = Object.entries(zod.resources ?? {})
		.map(([name, resource]) => ({
			name,
			typeName: pascalCase(name),
			fields: Object.entries(resource.fields ?? {}).map(
				([fieldName, field]) => ({
					name: fieldName,
					type: renderFieldType(field),
					example: exampleFieldValue(field),
				}),
			),
		}))
		.sort((left, right) => left.name.localeCompare(right.name));
	if (resources.length === 0) {
		throw new CodegenError(
			"HOBO_CODEGEN_SOURCE_PARSE",
			"resources.json must define at least one resource",
			{ file: layout.zod },
		);
	}

	const scopes = Object.entries(allow.scopes ?? {})
		.map(([name, scope]) => ({
			name,
			grants: [...(scope.grants ?? [])].sort(),
		}))
		.sort((left, right) => left.name.localeCompare(right.name));

	const bindles = [...(bindle.bindles ?? [])]
		.map((entry) => ({
			name: entry.name,
			provider: entry.provider,
			resources: [...(entry.resources ?? [])].sort(),
			steps: [...(entry.steps ?? [])].sort(),
			workflows: [...(entry.workflows ?? [])].sort(),
			with: Object.entries(entry.with ?? {})
				.map(([name, values]) => ({ name, values: [...values].sort() }))
				.sort((left, right) => left.name.localeCompare(right.name)),
		}))
		.sort((left, right) => left.name.localeCompare(right.name));

	return { rawSources, resources, scopes, bindles };
}

function assertValidWitSource(source: string, witPath: string): void {
	if (!/^package\s+hobo:sdk@0\.1\.0;/m.test(source)) {
		throw new CodegenError(
			"HOBO_CODEGEN_SOURCE_PARSE",
			`${witPath} must declare package hobo:sdk@0.1.0`,
			{ file: witPath },
		);
	}
	if (!/^world\s+app\s+\{/m.test(source)) {
		throw new CodegenError(
			"HOBO_CODEGEN_SOURCE_PARSE",
			`${witPath} must declare world app`,
			{ file: witPath },
		);
	}
}

function renderFieldType(field: RawField): string {
	if (field.type === "string") return "string";
	if (field.type === "number") return "number";
	if (field.type === "boolean") return "boolean";
	if (field.type === "enum") return union(field.values ?? []);
	return "unknown";
}

function exampleFieldValue(field: RawField): JsonValue {
	if (field.type === "string") return "example";
	if (field.type === "number") return 0;
	if (field.type === "boolean") return false;
	if (field.type === "enum") return [...(field.values ?? [])].sort()[0] ?? null;
	return null;
}

function renderApiTree(
	model: SourceModel,
	imports: CodegenGeneratedImports,
): string {
	const rows = model.resources
		.map((resource) => {
			const scope = findScopeForResource(model, resource.name);
			const bindle = findBindleForResource(model, resource.name);
			return `    ${resource.name}: { type: ${resource.typeName}; query: "${resource.name}.query"; subscribe: "${resource.name}.subscribe"; scope: "${scope}"; bindle: "${bindle}"; };`;
		})
		.join("\n");

	return (
		`import type { ${model.resources.map((resource) => resource.typeName).join(", ")} } from ${JSON.stringify(imports.bindingsSpecifier)};\n\n` +
		`export interface HoboApiTree {\n  resources: {\n${rows}\n  };\n}\n\n` +
		`export declare const api: HoboApiTree;\n`
	);
}

function renderBindings(model: SourceModel): string {
	const interfaces = model.resources
		.map((resource) => {
			const fields = resource.fields
				.map((field) => `  ${field.name}: ${field.type};`)
				.join("\n");
			return `export interface ${resource.typeName} {\n${fields}\n}`;
		})
		.join("\n\n");
	const resourceNames = union(model.resources.map((resource) => resource.name));

	return `${interfaces}\n\nexport type ResourceName = ${resourceNames};\n`;
}

function renderHooks(
	model: SourceModel,
	generatedImports: CodegenGeneratedImports,
): string {
	const imports = `import type { ${model.resources.map((resource) => resource.typeName).join(", ")} } from ${JSON.stringify(generatedImports.bindingsSpecifier)};`;
	const hooks = model.resources
		.flatMap((resource) => [
			`export declare function use${resource.typeName}Query(input?: { limit?: number }): Promise<readonly ${resource.typeName}[]>;`,
			`export declare function use${resource.typeName}Subscription(handler: (event: ${resource.typeName}) => void): () => void;`,
		])
		.join("\n");

	return `${imports}\n\n${hooks}\n`;
}

function renderStepSignatures(
	model: SourceModel,
	generatedImports: CodegenGeneratedImports,
): string {
	const imports = `import type { ${model.resources.map((resource) => resource.typeName).join(", ")} } from ${JSON.stringify(generatedImports.bindingsSpecifier)};`;
	const entries = model.bindles
		.flatMap((bindle) =>
			bindle.steps.map((step) => {
				const resource = model.resources.find((candidate) =>
					step.startsWith(`${candidate.name}.`),
				);
				// The model always has >=1 resource (normalizeSourceModel throws).
				const typeName = (resource ?? model.resources[0])?.typeName ?? "never";
				return `  "${step}": { input: ${typeName}; output: ${typeName}; };`;
			}),
		)
		.join("\n");

	return `${imports}\n\nexport interface StepSignatures {\n${entries}\n}\n`;
}

function renderWorkflowSignatures(
	model: SourceModel,
	generatedImports: CodegenGeneratedImports,
): string {
	const imports = `import type { ResourceName } from ${JSON.stringify(generatedImports.bindingsSpecifier)};`;
	const entries = model.bindles
		.flatMap((bindle) =>
			bindle.workflows.map(
				(workflow) =>
					`  "${workflow}": { resources: readonly ResourceName[]; provider: "${bindle.provider}"; };`,
			),
		)
		.join("\n");

	return `${imports}\n\nexport interface WorkflowSignatures {\n${entries}\n}\n`;
}

function renderWithOptions(model: SourceModel): string {
	const providerEntries = model.bindles
		.map((bindle) => {
			const options = bindle.with
				.map((entry) => `    ${entry.name}: ${union(entry.values)};`)
				.join("\n");
			return `  | { provider: "${bindle.provider}"; options: {\n${options}\n    } }`;
		})
		.join("\n");

	return `export type ProviderWithOptions =\n${providerEntries};\n`;
}

function findScopeForResource(
	model: SourceModel,
	resourceName: string,
): string {
	return (
		model.scopes.find((scope) =>
			scope.grants.some((grant) => grant.startsWith(`${resourceName}.`)),
		)?.name ?? "none"
	);
}

function findBindleForResource(
	model: SourceModel,
	resourceName: string,
): string {
	return (
		model.bindles.find((bindle) => bindle.resources.includes(resourceName))
			?.name ?? "none"
	);
}

function digestSources(
	sources: Record<string, string>,
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(sources)
			.map(([name, source]) => [name, digest(source)] as const)
			.sort(([left], [right]) => left.localeCompare(right)),
	);
}
