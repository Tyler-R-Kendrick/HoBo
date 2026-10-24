/**
 * Consumer-surface gate for the ts-autocode submodule (ADR-0128, ADR-0169).
 *
 * HoBo links three ts-autocode packages into its workspace and imports a few
 * dozen names from them. A pin bump (`pnpm run pins:bump ts-autocode <ref>`)
 * can rename or drop one of those names, or turn a value into a type, and
 * nothing else says so until a package build fails somewhere downstream. This
 * test reads every `import`/`export ... from "ts-autocode-*"` in HoBo's package
 * sources and checks each named binding against what the pinned commit's
 * package entry actually exports, with the TypeScript checker over the
 * submodule's source: a value import must be a value export, a type import any
 * export. It needs the submodule checked out (`pnpm run pins:fetch
 * ts-autocode`), not built, and fails rather than skips when it is absent.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

import ts from "typescript";

const root = join(import.meta.dirname, "../..");
const SUBMODULE = "external/ts-autocode";
const SPECIFIER = /^ts-autocode(?:-[a-z]+)?$/u;
const SOURCE_FILE = /\.(?:ts|tsx|mts|cts)$/u;
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "_generated"]);

interface ImportedName {
	readonly file: string;
	readonly specifier: string;
	/** The exported name, or `*` for `export * from`. */
	readonly name: string;
	readonly typeOnly: boolean;
}

interface PackageEntry {
	readonly directory: string;
	readonly entry: string;
}

/** Every TypeScript file under a `src` directory of a workspace package. */
function packageSources(directory: string, inSrc: boolean): string[] {
	const files: string[] = [];
	for (const item of readdirSync(directory, { withFileTypes: true })) {
		if (SKIPPED_DIRECTORIES.has(item.name) || item.name.startsWith("."))
			continue;
		const path = join(directory, item.name);
		if (item.isDirectory()) {
			files.push(...packageSources(path, inSrc || item.name === "src"));
		} else if (inSrc && item.isFile() && SOURCE_FILE.test(item.name)) {
			files.push(path);
		}
	}
	return files;
}

function namesIn(
	clause: ts.NamedImportBindings | ts.NamedExportBindings | undefined,
	typeOnly: boolean,
): { name: string; typeOnly: boolean }[] {
	if (clause === undefined) return [{ name: "*", typeOnly }];
	if (ts.isNamespaceImport(clause) || ts.isNamespaceExport(clause))
		return [{ name: "*", typeOnly }];
	return clause.elements.map((element) => ({
		name: (element.propertyName ?? element.name).text,
		typeOnly: typeOnly || element.isTypeOnly,
	}));
}

/** The named bindings one file takes from a ts-autocode package. */
function importsOf(path: string): ImportedName[] {
	const source = ts.createSourceFile(
		path,
		readFileSync(path, "utf8"),
		ts.ScriptTarget.Latest,
		false,
	);
	const file = relative(root, path);
	const found: ImportedName[] = [];
	for (const statement of source.statements) {
		const isImport = ts.isImportDeclaration(statement);
		if (!isImport && !ts.isExportDeclaration(statement)) continue;
		const module = statement.moduleSpecifier;
		if (module === undefined || !ts.isStringLiteral(module)) continue;
		if (!SPECIFIER.test(module.text)) continue;
		const bindings = isImport
			? namesIn(
					statement.importClause?.namedBindings,
					statement.importClause?.isTypeOnly ?? false,
				)
			: namesIn(statement.exportClause, statement.isTypeOnly);
		if (isImport && statement.importClause?.name !== undefined) {
			bindings.push({
				name: "default",
				typeOnly: statement.importClause.isTypeOnly,
			});
		}
		for (const binding of bindings) {
			found.push({ file, specifier: module.text, ...binding });
		}
	}
	return found;
}

/** Package name -> its directory and the source file its `.` export is built from. */
function submodulePackages(): ReadonlyMap<string, PackageEntry> {
	const packages = new Map<string, PackageEntry>();
	const base = join(root, SUBMODULE, "packages");
	for (const item of readdirSync(base, { withFileTypes: true })) {
		const manifestPath = join(base, item.name, "package.json");
		if (!item.isDirectory() || !existsSync(manifestPath)) continue;
		const manifest: {
			name?: string;
			exports?: { "."?: { import?: string } };
		} = JSON.parse(readFileSync(manifestPath, "utf8"));
		const built = manifest.exports?.["."]?.import;
		if (manifest.name === undefined || built === undefined) continue;
		// tsconfig: rootDir src, outDir dist.
		const entry = built
			.replace(/^\.\/dist\//u, "src/")
			.replace(/\.js$/u, ".ts");
		packages.set(manifest.name, {
			directory: `${SUBMODULE}/packages/${item.name}`,
			entry: join(base, item.name, entry),
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

function collectImports(): ImportedName[] {
	return packageSources(join(root, "packages"), false).flatMap(importsOf);
}

describe("ts-autocode consumer surface", () => {
	it("the submodule is checked out at its pin", () => {
		assert.ok(
			existsSync(join(root, SUBMODULE, "packages")),
			`${SUBMODULE} is not checked out: run \`pnpm run pins:fetch ts-autocode\``,
		);
	});

	const imports = collectImports();
	const packages = submodulePackages();

	it("finds HoBo's imports from ts-autocode (the scan is not empty)", () => {
		assert.ok(
			imports.length > 0,
			"no import from a ts-autocode package was found under packages/**/src",
		);
	});

	it("every ts-autocode package HoBo imports is a workspace member", () => {
		const members = workspaceMembers();
		const problems = [...new Set(imports.map((i) => i.specifier))]
			.filter((specifier) => {
				const found = packages.get(specifier);
				return (
					found === undefined ||
					!members.some((member) => member.test(found.directory))
				);
			})
			.map(
				(specifier) =>
					`${specifier}: ${packages.has(specifier) ? "not listed in pnpm-workspace.yaml" : `no package of that name under ${SUBMODULE}/packages`}`,
			);
		assert.deepEqual(problems, []);
	});

	it("every ts-autocode export HoBo imports exists at the pinned commit", () => {
		const used = [...new Set(imports.map((i) => i.specifier))].flatMap(
			(specifier) => {
				const found = packages.get(specifier);
				return found === undefined ? [] : [found.entry];
			},
		);
		const exported = exportsOf(used);
		const problems: string[] = [];
		for (const imported of imports) {
			const found = packages.get(imported.specifier);
			const names = found === undefined ? undefined : exported.get(found.entry);
			if (names === undefined || imported.name === "*") continue;
			const isValue = names.get(imported.name);
			if (isValue === undefined) {
				problems.push(
					`${imported.file}: ${imported.name} is not exported by ${imported.specifier}`,
				);
			} else if (!imported.typeOnly && !isValue) {
				problems.push(
					`${imported.file}: ${imported.name} is imported as a value but ${imported.specifier} exports only a type`,
				);
			}
		}
		assert.deepEqual(problems, []);
	});
});
