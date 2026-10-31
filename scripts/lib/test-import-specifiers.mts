/**
 * The module specifiers a source file names, read from its TypeScript syntax
 * tree.
 *
 * What is read, when the specifier is a string literal or a template literal
 * with no substitution:
 * - `import … from`, `import "…"`, `export … from`, `import x = require(…)`;
 * - `import(…)`, `require(…)`, `require.resolve(…)`, `import.meta.resolve(…)`;
 * - `createRequire(…)(…)`, and a name bound to `createRequire(…)` called or
 *   `.resolve`d;
 * - `vi.mock`, `vi.doMock`, `vi.importActual` and `vi.importMock`;
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

/** Names bound to `createRequire(…)` anywhere in the file. */
function requireNames(file: ts.SourceFile): Set<string> {
	const names = new Set(["require"]);
	const visit = (node: ts.Node): void => {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer !== undefined &&
			isCreateRequire(node.initializer)
		)
			names.add(node.name.text);
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
	requires: ReadonlySet<string>,
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
	if (ts.isIdentifier(owner) && owner.text === "vi" && VI_LOADERS.has(method))
		return first;
	return undefined;
}

/** Every module specifier `source` names, in source order. */
export function importSpecifiersOf(
	source: string,
	fileName: string,
): ImportSpecifier[] {
	const file = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKind(fileName),
	);
	const requires = requireNames(file);
	const out: ImportSpecifier[] = [];
	const add = (specifier: string | undefined, typeOnly: boolean) => {
		if (specifier !== undefined) out.push({ specifier, typeOnly });
	};
	const visit = (node: ts.Node): void => {
		if (ts.isImportDeclaration(node))
			add(
				literal(node.moduleSpecifier),
				importClauseIsTypeOnly(node.importClause),
			);
		else if (ts.isExportDeclaration(node))
			add(literal(node.moduleSpecifier), exportIsTypeOnly(node));
		else if (
			ts.isImportEqualsDeclaration(node) &&
			ts.isExternalModuleReference(node.moduleReference)
		)
			add(literal(node.moduleReference.expression), node.isTypeOnly);
		else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
			add(literal(node.argument.literal), true);
		else if (ts.isCallExpression(node))
			add(calledSpecifier(node, requires), false);
		ts.forEachChild(node, visit);
	};
	visit(file);
	return out;
}
