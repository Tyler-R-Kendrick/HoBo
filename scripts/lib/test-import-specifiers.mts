/**
 * The module specifiers a source file names, read from its TypeScript syntax
 * tree.
 *
 * What is read, when the specifier is a string literal or a template literal
 * with no substitution:
 * - `import … from`, `import "…"`, `export … from`, `import x = require(…)`;
 * - `import(…)`, `require(…)`, `require.resolve(…)`, `import.meta.resolve(…)`;
 * - `createRequire(…)(…)`, and a name bound to `createRequire(…)`, where it is
 *   declared or by a later assignment (`let req; req = createRequire(…)`),
 *   called or `.resolve`d;
 * - `vi.mock`, `vi.doMock`, `vi.importActual` and `vi.importMock`, where `vi`
 *   is the global or a name vitest's `vi` is imported as (`import { vi as v }`);
 * - `typeof import(…)` in a type.
 *
 * What cannot be read, and is not: a specifier computed or substituted at run
 * time (`import(\`@hobo/${name}\`)`, `require(base + "/x")`), and a path built
 * for a child process or a URL (`spawn("node", [join(root, "dist/cli.js")])`,
 * `new URL("../dist/x.js", import.meta.url)`). A string that holds source text
 * is not an import either: the scanner sees one literal.
 */
import ts from "typescript";

export interface ImportSpecifier {
	/** The specifier as written. */
	readonly specifier: string;
	/** True where a compiler erases the import: `import type`, all-`type` named imports, `typeof import()`. */
	readonly typeOnly: boolean;
}

const VI_LOADERS = new Set(["mock", "doMock", "importActual", "importMock"]);

function literal(node: ts.Node | undefined): string | undefined {
	if (
		node !== undefined &&
		(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
	)
		return node.text;
	return undefined;
}

function scriptKind(fileName: string): ts.ScriptKind {
	if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
	if (fileName.endsWith(".jsx")) return ts.ScriptKind.JSX;
	if (/\.[cm]?js$/u.test(fileName)) return ts.ScriptKind.JS;
	return ts.ScriptKind.TS;
}

function isCreateRequire(node: ts.Expression): boolean {
	if (!ts.isCallExpression(node)) return false;
	const callee = node.expression;
	return (
		(ts.isIdentifier(callee) && callee.text === "createRequire") ||
		(ts.isPropertyAccessExpression(callee) &&
			callee.name.text === "createRequire")
	);
}

interface LoaderNames {
	/** `require`, and names bound to `createRequire(…)`. */
	readonly requires: Set<string>;
	/** `vi`, and names vitest's `vi` is imported as. */
	readonly vis: Set<string>;
}

/** The names that load a module, bound anywhere in the file. */
function loaderNames(file: ts.SourceFile): LoaderNames {
	const names: LoaderNames = {
		requires: new Set(["require"]),
		vis: new Set(["vi"]),
	};
	const visit = (node: ts.Node): void => {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer !== undefined &&
			isCreateRequire(node.initializer)
		)
			names.requires.add(node.name.text);
		else if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			ts.isIdentifier(node.left) &&
			isCreateRequire(node.right)
		)
			names.requires.add(node.left.text);
		else if (
			ts.isImportSpecifier(node) &&
			(node.propertyName ?? node.name).text === "vi" &&
			literal(node.parent.parent.parent.moduleSpecifier) === "vitest"
		)
			names.vis.add(node.name.text);
		ts.forEachChild(node, visit);
	};
	visit(file);
	return names;
}

function importClauseIsTypeOnly(clause: ts.ImportClause | undefined): boolean {
	if (clause === undefined) return false;
	if (clause.isTypeOnly) return true;
	const bindings = clause.namedBindings;
	return (
		clause.name === undefined &&
		bindings !== undefined &&
		ts.isNamedImports(bindings) &&
		bindings.elements.length > 0 &&
		bindings.elements.every((element) => element.isTypeOnly)
	);
}

function exportIsTypeOnly(node: ts.ExportDeclaration): boolean {
	if (node.isTypeOnly) return true;
	const clause = node.exportClause;
	return (
		clause !== undefined &&
		ts.isNamedExports(clause) &&
		clause.elements.length > 0 &&
		clause.elements.every((element) => element.isTypeOnly)
	);
}

/** The specifier a call loads, if it is one of the loaders this reader knows. */
function calledSpecifier(
	node: ts.CallExpression,
	{ requires, vis }: LoaderNames,
): string | undefined {
	const callee = node.expression;
	const first = literal(node.arguments[0]);
	if (first === undefined) return undefined;
	if (callee.kind === ts.SyntaxKind.ImportKeyword) return first;
	if (ts.isIdentifier(callee))
		return requires.has(callee.text) ? first : undefined;
	if (isCreateRequire(callee)) return first;
	if (!ts.isPropertyAccessExpression(callee)) return undefined;
	const owner = callee.expression;
	const method = callee.name.text;
	if (
		method === "resolve" &&
		ts.isIdentifier(owner) &&
		requires.has(owner.text)
	)
		return first;
	if (method === "resolve" && isCreateRequire(owner)) return first;
	if (
		method === "resolve" &&
		ts.isMetaProperty(owner) &&
		owner.keywordToken === ts.SyntaxKind.ImportKeyword
	)
		return first;
	if (ts.isIdentifier(owner) && vis.has(owner.text) && VI_LOADERS.has(method))
		return first;
	return undefined;
}

/**
 * Stands in an assembled path for the part computed at run time: a template
 * literal's substitution, or a `join(…)`/`resolve(…)` argument that is not a
 * literal. It is not a character a path holds, so a literal `*` (a glob) stays
 * literal; the check shows it as `*`.
 */
export const COMPUTED = "\u0000";

/** What a file names, read from one parse. */
export interface ModuleFacts {
	/** Every module specifier, in source order. */
	readonly imports: ImportSpecifier[];
	/**
	 * The path text it assembles: each string or template literal that is not an
	 * import specifier, and each `join(…)`/`resolve(…)` call's arguments joined
	 * with `/`; a substitution or a non-literal argument reads `COMPUTED`.
	 */
	readonly paths: string[];
	/**
	 * Whether it runs or loads something by a path it computes: a child process
	 * (`spawn`, `exec`, `execFile`, `fork`, sync forms included), `import()` or
	 * `require` of a non-literal, `createRequire`, `symlink`, or `new Worker`.
	 */
	readonly loadsComputed: boolean;
}

const COMPUTED_LOADERS = new Set([
	"spawn",
	"spawnSync",
	"exec",
	"execSync",
	"execFile",
	"execFileSync",
	"fork",
	"createRequire",
	"symlink",
	"symlinkSync",
]);
const PATH_BUILDERS = new Set(["join", "resolve"]);

function calleeName(node: ts.Expression): string | undefined {
	if (ts.isIdentifier(node)) return node.text;
	if (ts.isPropertyAccessExpression(node)) return node.name.text;
	return undefined;
}

function templateText(node: ts.Node): string | undefined {
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
		return node.text;
	if (ts.isTemplateExpression(node))
		return [
			node.head.text,
			...node.templateSpans.map((span) => `${COMPUTED}${span.literal.text}`),
		].join("");
	return undefined;
}

/** What `source` names: its imports, the path text it assembles, and whether it loads by a computed path. */
export function readModule(source: string, fileName: string): ModuleFacts {
	const file = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKind(fileName),
	);
	const loaders = loaderNames(file);
	const imports: ImportSpecifier[] = [];
	const paths: string[] = [];
	const specifiers = new Set<ts.Node>();
	let loadsComputed = false;
	const add = (node: ts.Node | undefined, typeOnly: boolean) => {
		const specifier = literal(node);
		if (node === undefined || specifier === undefined) return;
		specifiers.add(node);
		imports.push({ specifier, typeOnly });
	};
	const visit = (node: ts.Node): void => {
		if (ts.isImportDeclaration(node))
			add(node.moduleSpecifier, importClauseIsTypeOnly(node.importClause));
		else if (ts.isExportDeclaration(node))
			add(node.moduleSpecifier, exportIsTypeOnly(node));
		else if (
			ts.isImportEqualsDeclaration(node) &&
			ts.isExternalModuleReference(node.moduleReference)
		)
			add(node.moduleReference.expression, node.isTypeOnly);
		else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
			add(node.argument.literal, true);
		else if (ts.isCallExpression(node)) {
			if (calledSpecifier(node, loaders) !== undefined)
				add(node.arguments[0], false);
			const name = calleeName(node.expression);
			// `exec` as a method is RegExp's far more often than child_process's.
			const loader =
				name !== undefined &&
				COMPUTED_LOADERS.has(name) &&
				(name !== "exec" || ts.isIdentifier(node.expression));
			const first = node.arguments[0];
			const computedArgument =
				first !== undefined && literal(first) === undefined;
			if (
				loader ||
				(computedArgument &&
					(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
						(ts.isIdentifier(node.expression) &&
							loaders.requires.has(node.expression.text))))
			)
				loadsComputed = true;
			if (
				name !== undefined &&
				PATH_BUILDERS.has(name) &&
				node.arguments.length > 1 &&
				node.arguments.some((argument) => templateText(argument) !== undefined)
			)
				paths.push(
					node.arguments
						.map((argument) => templateText(argument) ?? COMPUTED)
						.join("/"),
				);
		} else if (
			ts.isNewExpression(node) &&
			calleeName(node.expression) === "Worker"
		)
			loadsComputed = true;
		else if (!specifiers.has(node)) {
			const text = templateText(node);
			if (text !== undefined) paths.push(text);
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return { imports, paths, loadsComputed };
}

/** Every module specifier `source` names, in source order. */
export function importSpecifiersOf(
	source: string,
	fileName: string,
): ImportSpecifier[] {
	return readModule(source, fileName).imports;
}
