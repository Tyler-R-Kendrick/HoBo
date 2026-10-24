import { readFile } from "node:fs/promises";

import {
	type DeclaredTrainableClass,
	scanDeclaredTrainables,
} from "ts-autocode-grounding";
import ts from "typescript";
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
/** A file that never names a marker holds no marked class, so it is not parsed. */
const MARKER_NAME = /\b(?:trainable|component)\b/u;

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
	return declared;
}

/**
 * Scan the layout's source dir for ambient `@trainable declare class`
 * declarations. Refused: a class the scanner refuses (an overloaded or
 * non-identifier method name), two ambient classes of one name, and an
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
		if (!MARKER_NAME.test(source)) continue;
		const file = projectPath(projectRoot, path);
		for (const marked of markedClasses(source)) {
			if (!marked.ambient) {
				if (!decorated.has(marked.className)) {
					decorated.set(marked.className, file);
				}
				continue;
			}
			const earlier = found.find(
				(entry) => entry.declared.className === marked.className,
			);
			if (earlier !== undefined) {
				throw new CodegenError(
					"HOBO_CODEGEN_SOURCE_PARSE",
					`Ambient @trainable class ${marked.className} is declared in both ${earlier.file} and ${file}; its method refs would collide`,
					{ file, className: marked.className, earlier: earlier.file },
				);
			}
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
