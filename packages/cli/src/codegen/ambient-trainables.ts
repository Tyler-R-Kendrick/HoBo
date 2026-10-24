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

/**
 * `@`, then whitespace or comments, then a marker's name as an identifier
 * that ends there: what the scanner marks a class by (a decorator whose
 * expression, or whose call's callee, is that identifier), widened only by
 * not knowing whether the text is code, a comment or a string.
 */
const MARKER_DECORATOR = new RegExp(
	`@(?:\\s|\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*(?:\\n|$))*(?:${[...MARKERS]
		.map((marker) => [...marker].map(spelled).join(""))
		.join("|")})(?![\\p{ID_Continue}$\\u200C\\u200D\\\\])`,
	"u",
);

/**
 * Whether a source file may hold a class with a marker decorator, and so is
 * parsed: true for every file in which the scanner would find one.
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
 * The marked classes of one file, found as ts-autocode-grounding's scanner
 * finds them: a named class declaration or expression with a marker
 * decorator, ambient when it has `declare`, its own members not searched.
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
			node.name !== undefined &&
			isMarked(node)
		) {
			found.push({
				className: node.name.text,
				ambient:
					node.modifiers?.some(
						(modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword,
					) ?? false,
				text: source.slice(node.getStart(sourceFile), node.end),
			});
			return;
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
 * must be a plain ASCII identifier (camelCase keeps every character of one)
 * and a file name of its own on every file system: not one
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
