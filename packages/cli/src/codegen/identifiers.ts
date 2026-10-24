// Names codegen writes as bindings (`export const <name>`) or derives exports
// and file names from. Generated modules are ES modules, so strict-mode rules
// apply.

/**
 * An ASCII identifier. camelCase (trainables.ts) keeps its letters and digits
 * but drops `_` and `$`, which it splits words on, so two of these can
 * camelCase alike (`A_b.run` and `AB.run` are both `aBRun`); the export check
 * refuses that collision.
 */
const PLAIN_IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

/** Words a module cannot bind with `const` (reserved, strict-mode reserved, or restricted). */
const RESERVED = new Set([
	"arguments",
	"await",
	"break",
	"case",
	"catch",
	"class",
	"const",
	"continue",
	"debugger",
	"default",
	"delete",
	"do",
	"else",
	"enum",
	"eval",
	"export",
	"extends",
	"false",
	"finally",
	"for",
	"function",
	"if",
	"implements",
	"import",
	"in",
	"instanceof",
	"interface",
	"let",
	"new",
	"null",
	"package",
	"private",
	"protected",
	"public",
	"return",
	"static",
	"super",
	"switch",
	"this",
	"throw",
	"true",
	"try",
	"typeof",
	"var",
	"void",
	"while",
	"with",
	"yield",
]);

export function isPlainIdentifier(name: string): boolean {
	return PLAIN_IDENTIFIER.test(name);
}

export function isReservedWord(name: string): boolean {
	return RESERVED.has(name);
}
