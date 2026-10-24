/**
 * Consumer-surface gate for the ts-autocode submodule (ADR-0128, ADR-0169).
 *
 * HoBo links three ts-autocode packages into its workspace and imports a few
 * dozen names from them. A pin bump (`pnpm run pins:bump ts-autocode <ref>`)
 * can rename or drop one of those names, or turn a value into a type, and
 * nothing else says so until a package build fails somewhere downstream. This
 * test reads every reference to a `ts-autocode*` module in HoBo's packages
 * (sources and tests): `import`/`export ... from`, `import x = require(...)`,
 * a dynamic `import(...)` and an `import("...")` type, a subpath included.
 * It checks each against the pinned commit, with the TypeScript checker over
 * the submodule's source: the subpath must be an entry the package exports, a
 * named value must be a value export, a type any export, and every ts-autocode
 * package the imported ones depend on must be a workspace member too. It
 * needs the submodule checked out (`pnpm run pins:fetch ts-autocode`), not
 * built, and fails rather than skips when it is absent.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

import ts from "typescript";

const root = join(import.meta.dirname, "../..");
const SUBMODULE = "external/ts-autocode";
const NOT_CHECKED_OUT = `${SUBMODULE} is not checked out: run \`pnpm run pins:fetch ts-autocode\``;
/** A ts-autocode package name, then an optional subpath. */
const SPECIFIER = /^(ts-autocode(?:-[a-z]+)?)(?:\/(.+))?$/u;
const SOURCE_FILE = /\.(?:ts|tsx|mts|cts)$/u;
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "_generated"]);
const DEPENDENCY_FIELDS = [
	"dependencies",
	"devDependencies",
	"optionalDependencies",
	"peerDependencies",
] as const;

interface ImportedName {
	readonly file: string;
	/** The module specifier as written, for messages. */
	readonly specifier: string;
	readonly packageName: string;
	/** The `exports` key the specifier selects: `.` or `./<subpath>`. */
	readonly entryPoint: string;
	/** The exported name, or `*` when the whole module is taken. */
	readonly name: string;
	readonly typeOnly: boolean;
}

interface PackageEntry {
	readonly directory: string;
	/** `exports` key -> the source file its `import` condition is built from. */
	readonly entries: ReadonlyMap<string, string>;
	/** The ts-autocode packages its manifest depends on, in any dependency field. */
	readonly dependsOn: readonly string[];
}

type Binding = { readonly name: string; readonly typeOnly: boolean };

/** Every TypeScript file under `packages/` that names a ts-autocode module. */
function packageSources(directory: string): string[] {
	const files: string[] = [];
	for (const item of readdirSync(directory, { withFileTypes: true })) {
		if (SKIPPED_DIRECTORIES.has(item.name) || item.name.startsWith("."))
			continue;
		const path = join(directory, item.name);
		if (item.isDirectory()) {
			files.push(...packageSources(path));
		} else if (
			item.isFile() &&
			SOURCE_FILE.test(item.name) &&
			readFileSync(path, "utf8").includes("ts-autocode")
		) {
			files.push(path);
		}
	}
	return files;
}

function namesIn(
	clause: ts.NamedImportBindings | ts.NamedExportBindings | undefined,
	typeOnly: boolean,
): Binding[] {
	if (clause === undefined) return [{ name: "*", typeOnly }];
	if (ts.isNamespaceImport(clause) || ts.isNamespaceExport(clause))
		return [{ name: "*", typeOnly }];
	return clause.elements.map((element) => ({
		name: (element.propertyName ?? element.name).text,
		typeOnly: typeOnly || element.isTypeOnly,
	}));
}

function declarationBindings(
	statement: ts.ImportDeclaration | ts.ExportDeclaration,
): Binding[] {
	if (ts.isExportDeclaration(statement))
		return namesIn(statement.exportClause, statement.isTypeOnly);
	const clause = statement.importClause;
	if (clause === undefined) return [{ name: "*", typeOnly: false }];
	const bindings = namesIn(clause.namedBindings, clause.isTypeOnly);
	if (clause.name !== undefined)
		bindings.push({ name: "default", typeOnly: clause.isTypeOnly });
	return clause.namedBindings === undefined
		? bindings.filter((binding) => binding.name !== "*")
		: bindings;
}

/**
 * What a dynamic `import("…")` takes: the member read off it
 * (`(await import("x")).name`) or destructured from it
 * (`const { name } = await import("x")`); any other use takes the module.
 */
function dynamicBindings(call: ts.CallExpression): Binding[] {
	let node: ts.Node = call;
	while (
		ts.isParenthesizedExpression(node.parent) ||
		ts.isAwaitExpression(node.parent)
	) {
		node = node.parent;
	}
	const parent = node.parent;
	if (ts.isPropertyAccessExpression(parent) && parent.expression === node)
		return [{ name: parent.name.text, typeOnly: false }];
	if (
		ts.isVariableDeclaration(parent) &&
		parent.initializer === node &&
		ts.isObjectBindingPattern(parent.name)
	) {
		return parent.name.elements.map((element) => {
			const key = element.propertyName ?? element.name;
			return {
				name: ts.isIdentifier(key) || ts.isStringLiteral(key) ? key.text : "*",
				typeOnly: false,
			};
		});
	}
	return [{ name: "*", typeOnly: false }];
}

/** `import("x").Name` names a type, `typeof import("x").name` a value. */
function importTypeBindings(node: ts.ImportTypeNode): Binding[] {
	let qualifier = node.qualifier;
	while (qualifier !== undefined && ts.isQualifiedName(qualifier))
		qualifier = qualifier.left;
	return [
		{
			name: qualifier === undefined ? "*" : qualifier.text,
			typeOnly: !node.isTypeOf,
		},
	];
}

/** The module specifier a node references and what it takes, when it is one of the import forms. */
function referenceOf(
	node: ts.Node,
): { module: ts.Node | undefined; bindings: () => Binding[] } | undefined {
	if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
		return {
			module: node.moduleSpecifier,
			bindings: () => declarationBindings(node),
		};
	if (
		ts.isImportEqualsDeclaration(node) &&
		ts.isExternalModuleReference(node.moduleReference)
	)
		return {
			module: node.moduleReference.expression,
			bindings: () => [{ name: "*", typeOnly: node.isTypeOnly }],
		};
	if (
		ts.isCallExpression(node) &&
		node.expression.kind === ts.SyntaxKind.ImportKeyword
	)
		return { module: node.arguments[0], bindings: () => dynamicBindings(node) };
	if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
		return {
			module: node.argument.literal,
			bindings: () => importTypeBindings(node),
		};
	return undefined;
}

/** Every binding one file takes from a ts-autocode module, at any depth. */
function importsOf(path: string): ImportedName[] {
	const source = ts.createSourceFile(
		path,
		readFileSync(path, "utf8"),
		ts.ScriptTarget.Latest,
		true,
	);
	const file = relative(root, path);
	const found: ImportedName[] = [];
	const visit = (node: ts.Node): void => {
		const reference = referenceOf(node);
		const module = reference?.module;
		if (reference !== undefined && module !== undefined) {
			const match = ts.isStringLiteralLike(module)
				? SPECIFIER.exec(module.text)
				: null;
			const packageName = match?.[1];
			if (match !== null && packageName !== undefined) {
				const entryPoint = match[2] === undefined ? "." : `./${match[2]}`;
				for (const binding of reference.bindings()) {
					found.push({
						file,
						specifier: match[0],
						packageName,
						entryPoint,
						...binding,
					});
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return found;
}

/** Package name -> its directory, its entry points and its ts-autocode dependencies. */
function submodulePackages(): ReadonlyMap<string, PackageEntry> {
	const base = join(root, SUBMODULE, "packages");
	assert.ok(existsSync(base), NOT_CHECKED_OUT);
	const packages = new Map<string, PackageEntry>();
	for (const item of readdirSync(base, { withFileTypes: true })) {
		const manifestPath = join(base, item.name, "package.json");
		if (!item.isDirectory() || !existsSync(manifestPath)) continue;
		const manifest: {
			name?: string;
			/** A string target (no conditions) reads as having no `import` condition. */
			exports?: Record<string, { import?: string }>;
		} & Partial<
			Record<(typeof DEPENDENCY_FIELDS)[number], Record<string, string>>
		> = JSON.parse(readFileSync(manifestPath, "utf8"));
		if (manifest.name === undefined) continue;
		const entries = new Map<string, string>();
		for (const [key, target] of Object.entries(manifest.exports ?? {})) {
			const built = target.import;
			if (built === undefined) continue;
			// tsconfig: rootDir src, outDir dist.
			const entry = built
				.replace(/^\.\/dist\//u, "src/")
				.replace(/\.js$/u, ".ts");
			entries.set(key, join(base, item.name, entry));
		}
		const dependsOn = DEPENDENCY_FIELDS.flatMap((field) =>
			Object.keys(manifest[field] ?? {}),
		).filter((name) => SPECIFIER.test(name) && !name.includes("/"));
		packages.set(manifest.name, {
			directory: `${SUBMODULE}/packages/${item.name}`,
			entries,
			dependsOn: [...new Set(dependsOn)],
		});
	}
	return packages;
}

/** pnpm-workspace.yaml's `packages:` entries, each a path or a `*` glob, as matchers. */
function workspaceMembers(): readonly RegExp[] {
	const members: RegExp[] = [];
	let inPackages = false;
	for (const line of readFileSync(
		join(root, "pnpm-workspace.yaml"),
		"utf8",
	).split("\n")) {
		if (/^\S/u.test(line)) inPackages = line.startsWith("packages:");
		const item = /^\s+-\s+["']?([^"'\s]+)["']?\s*$/u.exec(line);
		if (inPackages && item?.[1] !== undefined) {
			const pattern = item[1]
				.split("*")
				.map((part) => part.replace(/[.+?^${}()|[\]\\]/gu, "\\$&"))
				.join("[^/]+");
			members.push(new RegExp(`^${pattern}$`, "u"));
		}
	}
	return members;
}

/**
 * Whether any link of an export's alias chain is type-only. `export { type x }`
 * (or `export type { x }`) still resolves to the value `x` through
 * `getAliasedSymbol`, but importing it as a value fails to compile (TS1362).
 */
function isTypeOnlyAlias(checker: ts.TypeChecker, symbol: ts.Symbol): boolean {
	const seen = new Set<ts.Symbol>();
	for (
		let link: ts.Symbol | undefined = symbol;
		link !== undefined &&
		(link.flags & ts.SymbolFlags.Alias) !== 0 &&
		!seen.has(link);
		link = checker.getImmediateAliasedSymbol(link)
	) {
		seen.add(link);
		if (link.declarations?.some(ts.isTypeOnlyImportOrExportDeclaration))
			return true;
	}
	return false;
}

/** What each entry exports: name -> whether it is a value (not only a type). */
function exportsOf(
	entries: readonly string[],
): ReadonlyMap<string, ReadonlyMap<string, boolean>> {
	const program = ts.createProgram(entries, {
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		target: ts.ScriptTarget.ES2022,
		noEmit: true,
		skipLibCheck: true,
		types: [],
	});
	const checker = program.getTypeChecker();
	const result = new Map<string, ReadonlyMap<string, boolean>>();
	for (const entry of entries) {
		const source = program.getSourceFile(entry);
		assert.ok(source, `${relative(root, entry)} is part of the program`);
		const module = checker.getSymbolAtLocation(source);
		assert.ok(module, `${relative(root, entry)} is a module`);
		const names = new Map<string, boolean>();
		for (const symbol of checker.getExportsOfModule(module)) {
			const target =
				(symbol.flags & ts.SymbolFlags.Alias) !== 0
					? checker.getAliasedSymbol(symbol)
					: symbol;
			names.set(
				symbol.name,
				(target.flags & ts.SymbolFlags.Value) !== 0 &&
					!isTypeOnlyAlias(checker, symbol),
			);
		}
		result.set(entry, names);
	}
	return result;
}

/** The imported packages and every ts-autocode package they depend on, each with who needs it. */
function packageClosure(
	imported: readonly string[],
	packages: ReadonlyMap<string, PackageEntry>,
): ReadonlyMap<string, string> {
	const neededBy = new Map<string, string>(
		imported.map((name) => [name, "imported by HoBo"]),
	);
	const queue = [...imported];
	for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
		for (const dependency of packages.get(name)?.dependsOn ?? []) {
			if (neededBy.has(dependency)) continue;
			neededBy.set(dependency, `a dependency of ${name}`);
			queue.push(dependency);
		}
	}
	return neededBy;
}

describe("ts-autocode consumer surface", () => {
	it("the submodule is checked out at its pin", () => {
		assert.ok(existsSync(join(root, SUBMODULE, "packages")), NOT_CHECKED_OUT);
	});

	const imports = packageSources(join(root, "packages")).flatMap(importsOf);

	it("finds HoBo's imports from ts-autocode (the scan is not empty)", () => {
		assert.ok(
			imports.length > 0,
			"no import from a ts-autocode package was found under packages/",
		);
	});

	it("every ts-autocode package HoBo imports, and each they depend on, is a workspace member", () => {
		const packages = submodulePackages();
		const members = workspaceMembers();
		const imported = [...new Set(imports.map((i) => i.packageName))];
		const problems = [...packageClosure(imported, packages)]
			.filter(([name]) => {
				const found = packages.get(name);
				return (
					found === undefined ||
					!members.some((member) => member.test(found.directory))
				);
			})
			.map(
				([name, why]) =>
					`${name} (${why}): ${packages.has(name) ? "not listed in pnpm-workspace.yaml" : `no package of that name under ${SUBMODULE}/packages`}`,
			);
		assert.deepEqual(problems, []);
	});

	it("every ts-autocode entry point and export HoBo imports exists at the pinned commit", () => {
		const packages = submodulePackages();
		const entryOf = (imported: ImportedName) =>
			packages.get(imported.packageName)?.entries.get(imported.entryPoint);
		const used = [
			...new Set(imports.flatMap((imported) => entryOf(imported) ?? [])),
		];
		const exported = exportsOf(used);
		const problems = new Set<string>();
		for (const imported of imports) {
			if (!packages.has(imported.packageName)) continue; // reported by the membership test
			const entry = entryOf(imported);
			if (entry === undefined) {
				problems.add(
					`${imported.file}: ${imported.specifier} is not an entry point ${imported.packageName} exports (no "import" condition for "${imported.entryPoint}")`,
				);
				continue;
			}
			const names = exported.get(entry);
			if (names === undefined || imported.name === "*") continue;
			const isValue = names.get(imported.name);
			if (isValue === undefined) {
				problems.add(
					`${imported.file}: ${imported.name} is not exported by ${imported.specifier}`,
				);
			} else if (!imported.typeOnly && !isValue) {
				problems.add(
					`${imported.file}: ${imported.name} is imported as a value but ${imported.specifier} exports only a type`,
				);
			}
		}
		assert.deepEqual([...problems], []);
	});
});
