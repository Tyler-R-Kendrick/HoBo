import { readFile } from "node:fs/promises";

import {
	type DeclaredTrainableClass,
	scanDeclaredTrainables,
} from "ts-autocode-grounding";
import ts from "typescript";
import { isPlainIdentifier, isReservedWord } from "./identifiers.js";
import { projectPath, scannedSources } from "./source-files.js";
import { CodegenError, type CodegenLayout } from "./types.js";

// Ambient `@trainable declare class` discovery for codegen (Plan 2 Syntax 0,
// ADR-0128). An ambient class is erased at compile time, so no decorator ever
// registers it, and codegen emits its registrations instead. A decorated class
// with a body registers itself when it is evaluated: codegen only notes its
// name. Each ambient class is scanned on its own by ts-autocode-grounding's
// scanner, so what that scanner refuses in a decorated class (overloads) never
// fails codegen, wherever the class sits.

/** An ambient `@trainable declare class` found in authored source. */
export interface AmbientTrainableClass {
	/** Project-relative source file (posix separators). */
	readonly file: string;
	readonly declared: DeclaredTrainableClass;
}

/** A class carrying one of ts-autocode-grounding's marker decorators, not yet scanned. */
interface MarkedClass {
	readonly className: string;
	readonly ambient: boolean;
	/** The class's own source, decorators included. */
	readonly text: string;
}

const MARKERS = new Set(["trainable", "component"]);
/**
 * File names Windows reserves for devices whatever the extension, so an
 * ambient class named one has no `declared/<Class>.ts` to be written to.
 */
const WINDOWS_DEVICE =
	/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9]|conin\$|conout\$)$/iu;
/**
 * One character of an identifier as source may spell it: itself, or a
 * unicode escape for it (`\u0074`, `\u{74}`), hex digits in either case.
 * TypeScript reads both as the same identifier, and so does the scanner.
 */
function spelled(char: string): string {
	const hex = (char.codePointAt(0) ?? 0).toString(16);
	const digits = [...hex]
		.map((digit) =>
			/[a-f]/u.test(digit) ? `[${digit}${digit.toUpperCase()}]` : digit,
		)
		.join("");
	return `(?:${char}|\\\\u${"0".repeat(4 - hex.length)}${digits}|\\\\u\\{0*${digits}\\})`;
}

/** TypeScript's line terminators (its scanner's `isLineBreak`). */
const LINE_BREAK = "\\n\\r\\u2028\\u2029";
/**
 * TypeScript's other whitespace (its scanner's `isWhiteSpaceSingleLine`):
 * JavaScript's `\s` without the line terminators, plus U+0085 and U+200B.
 */
const SPACE =
	"\\t\\v\\f \\u00A0\\u0085\\u1680\\u2000-\\u200B\\u202F\\u205F\\u3000\\uFEFF";
/** The position after a line terminator, where a merge conflict marker may start. */
const LINE_START = `(?<=[${LINE_BREAK}])`;
/** The rest of a line: up to a line terminator or the end of the text, never short of it. */
const REST_OF_LINE = `[^${LINE_BREAK}]*(?=[${LINE_BREAK}]|$)`;
/** Any text up to, never past, the first place `end` matches. */
function upTo(end: string): string {
	return `(?:(?!${end})[\\s\\S])*(?=${end})`;
}
/**
 * What TypeScript's scanner skips between two tokens, so between `@` and a
 * decorator's name: whitespace and line terminators; a block comment, to the
 * first end of comment; a line comment, to the end of its line, which any line
 * terminator makes; and a merge conflict marker at the start of a line
 * (scanConflictMarkerTrivia): `<<<<<<< ` and `>>>>>>> ` to the end of the line,
 * `||||||| ` through to the next `=======` or `>>>>>>> `, and `=======` through
 * to the next `>>>>>>> `. Each alternative stops where the scanner stops, so
 * backtracking cannot make a comment longer or a line shorter than the
 * scanner reads it.
 */
const TRIVIA = [
	`[${SPACE}${LINE_BREAK}]`,
	"\\/\\*(?:[^*]|\\*(?!\\/))*\\*\\/",
	`\\/\\/${REST_OF_LINE}`,
	`${LINE_START}(?:<{7}|>{7}) ${REST_OF_LINE}`,
	`${LINE_START}\\|{7} ${upTo(`${LINE_START}(?:={7}[\\s\\S]|>{7} )`)}`,
	`${LINE_START}={7}${upTo(`${LINE_START}>{7} `)}`,
].join("|");

/**
 * `@`, then TypeScript's trivia, then a marker's name as an identifier that
 * ends there: what the scanner marks a class by (a decorator whose
 * expression, or whose call's callee, is that identifier), widened only by
 * not knowing whether the text is code, a comment or a string.
 */
const MARKER_DECORATOR = new RegExp(
	`@(?:${TRIVIA})*(?:${[...MARKERS]
		.map((marker) => [...marker].map(spelled).join(""))
		.join("|")})(?![\\p{ID_Continue}$\\u200C\\u200D\\\\])`,
	"u",
);

/**
 * Whether a source file may hold a class with a marker decorator, and so is
 * parsed: true for every file in which the scanner would find one, since the
 * trivia it allows between `@` and the name is the trivia TypeScript's scanner
 * skips (checked against `ts.isWhiteSpaceLike` and `ts.isLineBreak` for every
 * UTF-16 code unit in the codegen test).
 */
export function mayHoldMarkedClass(source: string): boolean {
	return MARKER_DECORATOR.test(source);
}

function isMarked(node: ts.ClassDeclaration | ts.ClassExpression): boolean {
	return (
		ts.getDecorators(node)?.some((decorator) => {
			const callee = ts.isCallExpression(decorator.expression)
				? decorator.expression.expression
				: decorator.expression;
			return ts.isIdentifier(callee) && MARKERS.has(callee.text);
		}) ?? false
	);
}

/**
 * Whether a node compiles away around the expression it wraps: parentheses,
 * and TypeScript's `as`, `satisfies`, `!`, `<T>x` and `x<T>`, as TypeScript's
 * own `skipOuterExpressions` takes them.
 */
function isOuterExpression(
	node: ts.Node,
): node is
	| ts.ParenthesizedExpression
	| ts.AsExpression
	| ts.SatisfiesExpression
	| ts.NonNullExpression
	| ts.TypeAssertion
	| ts.ExpressionWithTypeArguments {
	return (
		ts.isParenthesizedExpression(node) ||
		ts.isAsExpression(node) ||
		ts.isSatisfiesExpression(node) ||
		ts.isNonNullExpression(node) ||
		ts.isTypeAssertionExpression(node) ||
		ts.isExpressionWithTypeArguments(node)
	);
}

function skipOuterExpressions(node: ts.Expression): ts.Expression {
	let inner = node;
	while (isOuterExpression(inner)) inner = inner.expression;
	return inner;
}

/** The assignment operators NamedEvaluation applies to: `=`, `&&=`, `||=`, `??=`. */
const NAMING_ASSIGNMENTS: ReadonlySet<ts.SyntaxKind> = new Set([
	ts.SyntaxKind.EqualsToken,
	ts.SyntaxKind.AmpersandAmpersandEqualsToken,
	ts.SyntaxKind.BarBarEqualsToken,
	ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

/**
 * The name a property name gives a function or class it holds: an
 * identifier's text, a string literal's value, a number's canonical string,
 * a private name with its `#`, or a computed key that is one of those
 * literals. Undefined for any other computed key, whose value only the run
 * time knows.
 */
function propertyKeyName(name: ts.PropertyName): string | undefined {
	const key = ts.isComputedPropertyName(name)
		? skipOuterExpressions(name.expression)
		: name;
	if (
		ts.isIdentifier(key) ||
		ts.isPrivateIdentifier(key) ||
		ts.isStringLiteral(key) ||
		ts.isNoSubstitutionTemplateLiteral(key)
	) {
		return key.text;
	}
	return ts.isNumericLiteral(key) ? String(Number(key.text)) : undefined;
}

/**
 * The name ECMAScript's NamedEvaluation gives the anonymous function or class
 * `value` from `holder`, the node it sits in once outer expressions are
 * skipped: the binding of a variable, binding element or parameter it
 * initializes (a pattern names nothing); the identifier an assignment (`=`,
 * `&&=`, `||=`, `??=`) or a shorthand default writes; the key of an object
 * property or of a class field or auto-accessor; and `default` for
 * `export default`. Where esbuild names a class the spec leaves anonymous,
 * the name it gives is taken too, so a clash under either compiler is seen:
 * an assignment target wrapped in parentheses or a type assertion, and a
 * `__proto__: value` property (which the spec excepts, since it sets the
 * prototype).
 */
function namedEvaluation(holder: ts.Node, value: ts.Node): string | undefined {
	if (
		(ts.isVariableDeclaration(holder) ||
			ts.isBindingElement(holder) ||
			ts.isParameter(holder)) &&
		holder.initializer === value
	) {
		return ts.isIdentifier(holder.name) ? holder.name.text : undefined;
	}
	if (
		ts.isBinaryExpression(holder) &&
		holder.right === value &&
		NAMING_ASSIGNMENTS.has(holder.operatorToken.kind)
	) {
		const target = skipOuterExpressions(holder.left);
		return ts.isIdentifier(target) ? target.text : undefined;
	}
	if (ts.isShorthandPropertyAssignment(holder)) {
		return holder.objectAssignmentInitializer === value
			? holder.name.text
			: undefined;
	}
	if (
		(ts.isPropertyAssignment(holder) || ts.isPropertyDeclaration(holder)) &&
		holder.initializer === value
	) {
		return propertyKeyName(holder.name);
	}
	if (ts.isExportAssignment(holder) && !holder.isExportEquals) {
		return "default";
	}
	return undefined;
}

/**
 * The name a class registers under, which grounding's
 * `finalizeTrainableClass` reads as `cls.name` when the class decorator runs:
 * its own name; `default` for an anonymous `export default class`; or, for an
 * anonymous class expression, the name NamedEvaluation gives it from where it
 * sits (see namedEvaluation). Undefined when nothing names it, or only a
 * computed key the run time evaluates. A class that defines a static `name`
 * method or getter decides its own `cls.name` at run time, which no scan of
 * its source can read.
 */
function registeredName(
	node: ts.ClassDeclaration | ts.ClassExpression,
): string | undefined {
	if (node.name !== undefined) return node.name.text;
	if (ts.isClassDeclaration(node)) {
		return node.modifiers?.some(
			(modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
		)
			? "default"
			: undefined;
	}
	let value: ts.Node = node;
	while (isOuterExpression(value.parent)) value = value.parent;
	return namedEvaluation(value.parent, value);
}

/**
 * The marked classes of one file, found as ts-autocode-grounding's scanner
 * finds them (a class declaration or expression with a marker decorator,
 * ambient when it has `declare`), each named as it registers: an anonymous
 * class expression takes the name NamedEvaluation gives it, which the scanner
 * does not see but the run time does. Unlike the scanner, the search goes on
 * inside a marked class with a body: a decorated class in one of its static
 * fields or methods registers too, once that code runs. An ambient class can
 * hold no code, so the search stops at one.
 */
function markedClasses(source: string): readonly MarkedClass[] {
	const sourceFile = ts.createSourceFile(
		"source.ts",
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const found: MarkedClass[] = [];
	const visit = (node: ts.Node): void => {
		if (
			(ts.isClassDeclaration(node) || ts.isClassExpression(node)) &&
			isMarked(node)
		) {
			const className = registeredName(node);
			const ambient =
				node.modifiers?.some(
					(modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword,
				) ?? false;
			if (className !== undefined) {
				found.push({
					className,
					ambient,
					text: source.slice(node.getStart(sourceFile), node.end),
				});
			}
			if (ambient) return;
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return found;
}

/** One ambient class through ts-autocode-grounding's scanner; what it refuses is a codegen error. */
function scanAmbient(
	file: string,
	marked: MarkedClass,
): DeclaredTrainableClass {
	let classes: readonly DeclaredTrainableClass[];
	try {
		classes = scanDeclaredTrainables(marked.text);
	} catch (error) {
		throw new CodegenError(
			"HOBO_CODEGEN_SOURCE_PARSE",
			`Cannot scan the ambient @trainable class ${marked.className} in ${file}: ${error instanceof Error ? error.message : error}`,
			{ file, className: marked.className },
		);
	}
	const [declared] = classes;
	if (
		classes.length !== 1 ||
		declared === undefined ||
		!declared.ambient ||
		declared.className !== marked.className
	) {
		throw new CodegenError(
			"HOBO_CODEGEN_SOURCE_PARSE",
			`ts-autocode-grounding does not scan ${marked.className} in ${file} as one ambient @trainable class`,
			{ file, className: marked.className },
		);
	}
	for (const { method } of declared.operations) {
		// The emitter writes `export const <method> = defineGrounding(...)`.
		const why = isReservedWord(method)
			? "a reserved word"
			: method === "defineGrounding"
				? "the name it imports defineGrounding by"
				: undefined;
		if (why !== undefined) {
			throw new CodegenError(
				"HOBO_CODEGEN_SOURCE_PARSE",
				`Ambient @trainable class ${marked.className} in ${file} has a method named ${method}, which declared/${marked.className}.ts cannot export as a const (${why}); rename the method`,
				{ file, className: marked.className, method },
			);
		}
	}
	return declared;
}

/**
 * An ambient class's registrations are written to `declared/<Class>.ts`, and
 * its exports are named from the camelCase of `<Class>.<method>`, so its name
 * must be a plain ASCII identifier (camelCase keeps only ASCII letters and
 * digits, so any other letter would vanish from its exports; `_` and `$`
 * vanish too, and an export that then collides is refused) and a file name of
 * its own on every file system: not one
 * Windows reserves for a device, and not one another ambient class has in
 * another case (macOS and Windows compare names case-insensitively).
 */
function refuseModuleName(
	found: readonly AmbientTrainableClass[],
	file: string,
	className: string,
): void {
	if (!isPlainIdentifier(className)) {
		throw new CodegenError(
			"HOBO_CODEGEN_SOURCE_PARSE",
			`Ambient @trainable class ${className} in ${file} is not a plain ASCII identifier; codegen names its module file and exports from it, and would drop letters; rename the class`,
			{ file, className },
		);
	}
	if (WINDOWS_DEVICE.test(className)) {
		throw new CodegenError(
			"HOBO_CODEGEN_SOURCE_PARSE",
			`Ambient @trainable class ${className} in ${file} cannot have a registration module: Windows reserves the file name ${className}.ts for a device; rename the class`,
			{ file, className },
		);
	}
	const earlier = found.find(
		(entry) =>
			entry.declared.className.toLowerCase() === className.toLowerCase(),
	);
	if (earlier === undefined) return;
	const earlierName = earlier.declared.className;
	throw new CodegenError(
		"HOBO_CODEGEN_SOURCE_PARSE",
		earlierName === className
			? `Ambient @trainable class ${className} is declared in both ${earlier.file} and ${file}; its method refs would collide`
			: `Ambient @trainable classes ${earlierName} (${earlier.file}) and ${className} (${file}) differ only in case; declared/${earlierName}.ts and declared/${className}.ts are one file on a case-insensitive file system`,
		{ file, className, earlier: earlier.file },
	);
}

/**
 * Scan the layout's source dir for ambient `@trainable declare class`
 * declarations. Refused: a class the scanner refuses (an overloaded or
 * non-identifier method name), two ambient classes of one name in any case
 * or one named like a Windows device (see refuseModuleName), and an
 * ambient class named like a decorated `@trainable` class, whose methods
 * register under the same `<Class>.<method>` refs (one registration would
 * silently replace the other).
 */
export async function scanAmbientTrainableClasses(
	projectRoot: string,
	layout: CodegenLayout,
): Promise<readonly AmbientTrainableClass[]> {
	const found: AmbientTrainableClass[] = [];
	const decorated = new Map<string, string>();
	for (const path of await scannedSources(projectRoot, layout)) {
		const source = await readFile(path, "utf8");
		if (!mayHoldMarkedClass(source)) continue;
		const file = projectPath(projectRoot, path);
		for (const marked of markedClasses(source)) {
			if (!marked.ambient) {
				if (!decorated.has(marked.className)) {
					decorated.set(marked.className, file);
				}
				continue;
			}
			refuseModuleName(found, file, marked.className);
			found.push({ file, declared: scanAmbient(file, marked) });
		}
	}
	for (const { file, declared } of found) {
		const other = decorated.get(declared.className);
		if (other !== undefined) {
			throw new CodegenError(
				"HOBO_CODEGEN_SOURCE_PARSE",
				`Ambient @trainable class ${declared.className} in ${file} shares its name with the decorated @trainable class in ${other}; both register ${declared.className}.<method>, and one registration would silently replace the other`,
				{ file, className: declared.className, decorated: other },
			);
		}
	}
	return found;
}
