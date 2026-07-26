// Source scanner for ambient trainable declarations (Plan 2 Syntax 0,
// `hobo stub` path). An `export declare class` is erased at compile time —
// no decorator ever runs — so the syntax below is honored statically:
//
//   @trainable
//   export declare class Program {
//     @intent("Produce a simple hello-world program")
//     @returns("Hello World! or Hello, <name>! when supplied")
//     trainableMethod(
//       @description("Optional person to greet")
//       name?: string,
//     ): string;
//   }
//
// Every decorator is optional: a bare `@trainable declare class` with
// undecorated method signatures still scans — intent is inferred and the
// TypeScript signature is the declared shape. The scan result feeds
// codegen (`hobo stub` emits `training.define` registrations into
// `src/_generated/`), mirroring lintUseTrainingSource's regex approach.

export interface DeclaredParameter {
	readonly name: string;
	readonly type: string;
	readonly optional: boolean;
	readonly description?: string;
}

export interface DeclaredOperation {
	readonly methodRef: string;
	readonly method: string;
	readonly intent: string;
	readonly inferredIntent: boolean;
	readonly returns?: string;
	readonly contractRef: string;
	readonly parameters: readonly DeclaredParameter[];
	readonly outputType: string;
}

export interface DeclaredTrainableClass {
	readonly className: string;
	readonly ambient: boolean;
	readonly operations: readonly DeclaredOperation[];
}

const CLASS_PATTERN =
	/@trainable\b(?:\s*\(\s*\))?\s*(?:export\s+)?(declare\s+)?(?:abstract\s+)?class\s+(\w+)[^{]*\{/g;

/** Scan source for `@trainable` classes (ambient or not) and their declared operations. */
export function scanDeclaredTrainables(
	source: string,
): readonly DeclaredTrainableClass[] {
	if (typeof source !== "string") {
		throw new TypeError("source must be a string");
	}
	const classes: DeclaredTrainableClass[] = [];
	CLASS_PATTERN.lastIndex = 0;
	for (
		let match = CLASS_PATTERN.exec(source);
		match;
		match = CLASS_PATTERN.exec(source)
	) {
		const body = classBody(source, CLASS_PATTERN.lastIndex - 1);
		if (body === undefined) continue;
		const className = match[2] as string;
		classes.push({
			className,
			ambient: Boolean(match[1]),
			operations: scanOperations(className, body),
		});
	}
	return classes;
}

/** Extract the `{ … }` body starting at the opening brace (balanced). */
function classBody(source: string, openBrace: number): string | undefined {
	let depth = 0;
	for (let i = openBrace; i < source.length; i += 1) {
		if (source[i] === "{") depth += 1;
		if (source[i] === "}") {
			depth -= 1;
			if (depth === 0) return source.slice(openBrace + 1, i);
		}
	}
	return undefined;
}

const MEMBER_PATTERN =
	/((?:@\w+\s*\([\s\S]*?\)\s*|@\w+\s+)*)(\w+)\s*\(([\s\S]*?)\)\s*:\s*([^;{]+)[;{]/g;

function scanOperations(
	className: string,
	body: string,
): readonly DeclaredOperation[] {
	const operations: DeclaredOperation[] = [];
	MEMBER_PATTERN.lastIndex = 0;
	for (
		let match = MEMBER_PATTERN.exec(body);
		match;
		match = MEMBER_PATTERN.exec(body)
	) {
		const [, decorators = "", method, params = "", returnType = ""] = match;
		if (method === "constructor") continue;
		const methodRef = `${className}.${method}`;
		const declaredIntent = decoratorText(decorators, "intent");
		const declaredReturns = decoratorText(decorators, "returns");
		operations.push({
			methodRef,
			method: method as string,
			intent:
				declaredIntent ??
				`Inferred: implement ${methodRef} to satisfy its declared signature and descriptions.`,
			inferredIntent: declaredIntent === undefined,
			...(declaredReturns !== undefined ? { returns: declaredReturns } : {}),
			contractRef: `decl://${methodRef}`,
			parameters: scanParameters(params),
			outputType: returnType.trim(),
		});
	}
	return operations;
}

function decoratorText(decorators: string, name: string): string | undefined {
	const match = decorators.match(
		new RegExp(`@${name}\\s*\\(\\s*(["'])((?:\\\\.|(?!\\1).)*)\\1`),
	);
	return match?.[2]?.replace(/\\(["'])/g, "$1");
}

function scanParameters(params: string): readonly DeclaredParameter[] {
	const out: DeclaredParameter[] = [];
	for (const raw of splitTopLevel(params)) {
		const description = decoratorText(raw, "description");
		const bare = raw.replace(/@\w+\s*\([\s\S]*?\)\s*/g, "").trim();
		const match = bare.match(/^(\w+)(\?)?\s*:\s*([\s\S]+)$/);
		if (!match) continue;
		out.push({
			name: match[1] as string,
			optional: Boolean(match[2]),
			type: (match[3] as string).trim(),
			...(description !== undefined ? { description } : {}),
		});
	}
	return out;
}

/** Split a parameter list on top-level commas (ignores nested (), <>, {}). */
function splitTopLevel(params: string): readonly string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = "";
	for (const char of params) {
		if ("(<{[".includes(char)) depth += 1;
		if (")>}]".includes(char)) depth -= 1;
		if (char === "," && depth === 0) {
			parts.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	if (current.trim().length > 0) parts.push(current);
	return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/**
 * Generate the `training.define` registration source for a scanned class —
 * what `hobo stub` writes into `src/_generated/trainables.ts`. The declared
 * TypeScript signature becomes the contract's shape descriptors, so the
 * registration grounds (shape present) even with every decorator omitted.
 */
export function generateDeclaredRegistrations(
	declared: DeclaredTrainableClass,
): string {
	const lines: string[] = [
		"// Generated by hobo stub from an ambient @trainable declaration —",
		"// do not edit by hand (ADR-0037 generated-vs-authored boundary).",
		'import { training } from "@hobo/runtime";',
		"",
	];
	for (const op of declared.operations) {
		const input = Object.fromEntries(
			op.parameters.map((p) => [
				p.name,
				{
					type: p.type,
					optional: p.optional,
					...(p.description ? { description: p.description } : {}),
				},
			]),
		);
		const params = Object.fromEntries(
			op.parameters
				.filter((p) => p.description)
				.map((p) => [p.name, { description: p.description }]),
		);
		const options = {
			methodRef: op.methodRef,
			intent: op.intent,
			contract: {
				ref: op.contractRef,
				input,
				output: {
					type: op.outputType,
					...(op.returns ? { description: op.returns } : {}),
				},
			},
			...(Object.keys(params).length > 0 ? { params } : {}),
			...(op.returns
				? { output: { returns: { description: op.returns } } }
				: {}),
		};
		lines.push(
			`export const ${op.method} = training.define(${JSON.stringify(options, null, "\t")});`,
			"",
		);
	}
	return lines.join("\n");
}
