import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { serializeTrainingArtifactProgram } from "@hobo/core";
import {
	applyTrainingArtifact,
	generateDeclaredRegistrations,
	isTrainable,
	listTrainables,
	resetTrainables,
	scanDeclaredTrainables,
	type Trainable,
} from "@hobo/runtime";
import { scanDeclaredTrainables as groundingScan } from "ts-autocode-grounding";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProjectCodegenEngine } from "../src/codegen/engine.js";
import { writeFixtureProject } from "../src/codegen/fixture.js";
import { mayHoldMarkedClass } from "../src/codegen/marker-prefilter.js";
import { runCodegen } from "../src/codegen/run-codegen.js";
import { defaultCodegenLayout } from "../src/codegen/types.js";
import { createHoboCli } from "../src/index.js";

// Plan 2 Syntax 0 through `hobo stub` (ADR-0128): an ambient
// `@trainable declare class` is erased at compile time, so codegen scans it
// and writes ts-autocode-grounding's `defineGrounding(...)` registrations for
// it, which `@hobo/runtime` answers as `training.define`. Every method ref
// below is derived by the scanner from the class and method names; none is
// passed to the runtime by hand. The temp project lives inside the package so
// vitest's transform pipeline can import the generated TypeScript.

const AMBIENT = `
@trainable
export declare class Greeter {
  @intent("Greet a person by name")
  @returns("A greeting")
  greet(
    @description("Who to greet")
    name?: string,
  ): string;
}
`;

// A decorated class with a body registers itself at run time; codegen leaves it alone.
const DECORATED = `
@trainable
export class Todos {
  @intent("List all todos")
  list(): string[] {
    return [];
  }
}
`;

// One file, both kinds: only the ambient class gets registrations.
const MIXED = `
@trainable
export declare class Inbox {
  unread(): number;
}

@trainable
export class Outbox {
  pending(): number {
    return 0;
  }
}
`;

// Overloads in a decorated class are its own business; it registers itself.
const DECORATED_OVERLOADS = `
@trainable
export class Router {
  route(path: string): string;
  route(path: string, method: string): string;
  route(path: string, method?: string): string {
    return method ?? path;
  }
}
`;

// Overloads in an ambient class would write two `export const now`.
const AMBIENT_OVERLOADS = `
@trainable
export declare class Clock {
  now(): string;
  now(zone: string): string;
}
`;

const CLASS_BODY = '{\n  greet(): string {\n    return "hi";\n  }\n}';

/**
 * Where ECMAScript's NamedEvaluation gives an anonymous class expression a
 * name, `Greeter` each time: a decorated `@trainable` class there registers
 * `Greeter.<method>`, as its own name would, under TypeScript's emit and
 * esbuild's. The last row is one only esbuild names (the spec leaves a
 * parenthesized assignment target anonymous); codegen takes either.
 */
const NAMED_EVALUATIONS: readonly (readonly [
	string,
	(cls: string) => string,
])[] = [
	["a const binding", (cls) => `export const Greeter = ${cls};\n`],
	["a parenthesized binding", (cls) => `export let Greeter = (${cls});\n`],
	[
		"a binding through as, satisfies and !",
		(cls) => `export const Greeter = ((${cls}) as object satisfies object)!;\n`,
	],
	[
		"an assignment",
		(cls) => `export let Greeter: unknown;\nGreeter = ${cls};\n`,
	],
	[
		"a logical assignment",
		(cls) => `export let Greeter: unknown;\nGreeter ??= ${cls};\n`,
	],
	[
		"an object property",
		(cls) => `export const impls = { Greeter: ${cls} };\n`,
	],
	[
		"a string-keyed property",
		(cls) => `export const impls = { "Greeter": ${cls} };\n`,
	],
	[
		"a computed property key",
		(cls) => `export const impls = { ["Greeter"]: ${cls} };\n`,
	],
	[
		"a shorthand default in an assignment pattern",
		(cls) => `export let Greeter: unknown;\n({ Greeter = ${cls} } = {});\n`,
	],
	[
		"an array assignment default",
		(cls) => `export let Greeter: unknown;\n[Greeter = ${cls}] = [];\n`,
	],
	[
		"a static class field",
		(cls) => `export class Holder {\n  static Greeter = ${cls};\n}\n`,
	],
	[
		"an instance class field",
		(cls) => `export class Holder {\n  Greeter = ${cls};\n}\n`,
	],
	[
		"a computed class field key",
		(cls) => `export class Holder {\n  static ["Greeter"] = ${cls};\n}\n`,
	],
	[
		"an auto-accessor",
		(cls) => `export class Holder {\n  static accessor Greeter = ${cls};\n}\n`,
	],
	[
		"a destructuring default",
		(cls) =>
			`export const { Greeter = ${cls} } = {} as { Greeter?: unknown };\n`,
	],
	[
		"a renamed destructuring default",
		(cls) =>
			`export const { impl: Greeter = ${cls} } = {} as { impl?: unknown };\n`,
	],
	[
		"an array destructuring default",
		(cls) => `export const [Greeter = ${cls}] = [] as unknown[];\n`,
	],
	[
		"a parameter default",
		(cls) => `export function make(Greeter = ${cls}) {\n  return Greeter;\n}\n`,
	],
	[
		"an assignment to a parenthesized target",
		(cls) => `export let Greeter: unknown;\n(Greeter) = ${cls};\n`,
	],
];

/** Where an anonymous class expression gets no binding's name (`cls.name` is ""). */
const UNNAMED_PLACES: readonly (readonly [string, (cls: string) => string])[] =
	[
		["after a comma", (cls) => `export const Greeter = (0, ${cls});\n`],
		[
			"in a conditional",
			(cls) => `export const Greeter = Math.random() > 0.5 ? ${cls} : null;\n`,
		],
		[
			"assigned to a member",
			(cls) =>
				`export const holder: Record<string, unknown> = {};\nholder.Greeter = ${cls};\n`,
		],
		[
			"in a compound assignment",
			(cls) => `export let Greeter: unknown = "";\nGreeter += ${cls};\n`,
		],
	];

/**
 * A decorated class inside another marked class: it registers too, once the
 * code around it runs (a static field when the outer class is defined, a
 * method's body when the method is called), so its name is checked as well.
 */
const NESTED_IN_MARKED: readonly (readonly [string, string])[] = [
	[
		"a static field of a @component class",
		`@component({ intent: "x" })\nexport class Service {\n  static Greeter = @trainable class ${CLASS_BODY};\n}\n`,
	],
	[
		"a class expression in a method of a @trainable class",
		`@trainable\nexport class Outer {\n  make() {\n    const Greeter = @trainable class ${CLASS_BODY};\n    return Greeter;\n  }\n}\n`,
	],
	[
		"a class declaration in a method of a @trainable class",
		`@trainable\nexport class Outer {\n  make() {\n    @trainable\n    class Greeter ${CLASS_BODY}\n    return Greeter;\n  }\n}\n`,
	],
];

describe("the marker prefilter", () => {
	const ambient = (decorator: string) =>
		`${decorator}\nexport declare class Esc {\n  run(): string;\n}\n`;

	it("passes every file grounding's scanner finds a marked class in, escaped spellings included", () => {
		for (const decorator of [
			"@trainable",
			"@component({ intent: 'x' })",
			"@ trainable",
			"@/* note */ trainable",
			"@\\u0074rainable",
			"@\\u{74}rainable",
			"@tr\\u0061inable",
			"@\\u0063omponent",
			"@\\u{0063}omponent()",
			// Whitespace to TypeScript's scanner that JavaScript's \s is not.
			"@\u200Btrainable",
			"@\u0085trainable",
			// A line comment ends at any of TypeScript's line terminators.
			"@// note\rtrainable",
			"@// note\u2028trainable",
			"@// note\u2029trainable",
			// The scanner skips a merge conflict marker as trivia.
			"@\n<<<<<<< ours\ntrainable",
			"@\n||||||| base\n=======\n>>>>>>> theirs\ntrainable",
			"@\n=======\nx\n>>>>>>> theirs\ntrainable",
		]) {
			const source = ambient(decorator);
			expect(groundingScan(source).length, decorator).toBe(1);
			expect(mayHoldMarkedClass(source), decorator).toBe(true);
		}
	});

	it("takes what TypeScript's scanner takes for whitespace and a line terminator, and nothing else", () => {
		for (let code = 0; code <= 0xffff; code++) {
			// A lone surrogate is no character; a second @ starts a decorator of its own.
			if ((code >= 0xd800 && code <= 0xdfff) || code === 0x40) continue;
			const char = String.fromCharCode(code);
			expect(
				mayHoldMarkedClass(ambient(`@${char}trainable`)),
				`U+${code.toString(16)} after @`,
			).toBe(ts.isWhiteSpaceLike(code));
			expect(
				mayHoldMarkedClass(ambient(`@// note${char}trainable`)),
				`U+${code.toString(16)} after a line comment`,
			).toBe(ts.isLineBreak(code));
		}
	});

	it("reads a file in time linear in its length", () => {
		// Each `@` here starts trivia that runs on to a point many other `@`s
		// share (the end of the text, the end of one long line, one long
		// escape), so a reader that walks it again from every `@` is quadratic:
		// a backtracking prefilter took 44 s on the conflict-marker text.
		const cases: readonly (readonly [string, string])[] = [
			["conflict markers with no end", "@\n||||||| x\n".repeat(32_000)],
			["unterminated block comments", "@/*".repeat(125_000)],
			[
				"line comments on one line, then whitespace",
				`${"@//".repeat(62_500)}\n${" ".repeat(187_500)}x`,
			],
			[
				"line comments on one line, then one long escape",
				`${"@//".repeat(62_500)}\n\\u{${"0".repeat(187_500)}74}rainablex`,
			],
		];
		for (const [label, text] of cases) {
			const started = performance.now();
			expect(mayHoldMarkedClass(text), label).toBe(false);
			expect(performance.now() - started, label).toBeLessThan(2_000);
		}
	}, 600_000);

	it("skips a file that only names a marker without decorating with it", () => {
		for (const prefix of [
			"const component = 1;",
			"import { trainable } from '@hobo/runtime';",
			"@trainables",
			"@trainable_x",
			"@\\u0074rainableX",
			"@(trainable)",
			// Not merge conflict markers: no space after <<<<<<<, or not at a line's start.
			"@\n<<<<<<<ours\ntrainable",
			"@ <<<<<<< ours\ntrainable",
		]) {
			const source = ambient(prefix);
			expect(groundingScan(source).length, prefix).toBe(0);
			expect(mayHoldMarkedClass(source), prefix).toBe(false);
		}
	});
});

describe("ambient @trainable classes in hobo stub", () => {
	let projectRoot: string;

	beforeEach(async () => {
		projectRoot = await mkdtemp(
			join(fileURLToPath(new URL(".", import.meta.url)), ".tmp-declared-"),
		);
		await writeFixtureProject(projectRoot);
		await writeFile(join(projectRoot, "src/greeter.ts"), AMBIENT);
		await writeFile(join(projectRoot, "src/todos.ts"), DECORATED);
	});

	afterEach(async () => {
		resetTrainables();
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("writes defineGrounding registrations from @hobo/runtime and re-exports them", async () => {
		await runCodegen({ projectRoot, check: false });

		const declared = await readFile(
			join(projectRoot, "src/_generated/declared/Greeter.ts"),
			"utf8",
		);
		expect(declared).toContain(
			'import { defineGrounding } from "@hobo/runtime";',
		);
		expect(declared).toContain("export const greet = defineGrounding(");
		expect(declared).toContain('"ref": "decl://Greeter.greet"');

		const trainables = await readFile(
			join(projectRoot, "src/_generated/trainables.ts"),
			"utf8",
		);
		expect(trainables).toContain(
			'export { greet as greeterGreet } from "./declared/Greeter.js";',
		);
		await expect(
			access(join(projectRoot, "src/_generated/declared/Todos.ts")),
		).rejects.toThrow();
	});

	it("writes the module @hobo/runtime's generateDeclaredRegistrations writes for the class", async () => {
		await runCodegen({ projectRoot, check: false });
		const written = await readFile(
			join(projectRoot, "src/_generated/declared/Greeter.ts"),
			"utf8",
		);
		const [declared] = scanDeclaredTrainables(AMBIENT);
		expect(declared).toBeDefined();
		if (declared === undefined) return;
		expect(
			generateDeclaredRegistrations(declared, { file: "src/greeter.ts" }),
		).toBe(written);
	});

	it("compiles with declaration emit under the repository's base tsconfig", async () => {
		// declaration: true is tsconfig.base.json's default; every export's
		// inferred type must be nameable from @hobo/runtime's root.
		await runCodegen({ projectRoot, check: false });
		const base = fileURLToPath(
			new URL("../../../tsconfig.base.json", import.meta.url),
		);
		const config = ts.readConfigFile(base, ts.sys.readFile);
		const { options, errors } = ts.convertCompilerOptionsFromJson(
			config.config?.compilerOptions,
			join(base, ".."),
		);
		expect(errors).toEqual([]);
		const program = ts.createProgram(
			[join(projectRoot, "src/_generated/trainables.ts")],
			{
				...options,
				declaration: true,
				emitDeclarationOnly: true,
				rootDir: projectRoot,
				outDir: join(projectRoot, ".tsc-out"),
				types: [],
			},
		);
		const emitted = program.emit(undefined, () => undefined);
		const diagnostics = [
			...ts.getPreEmitDiagnostics(program),
			...emitted.diagnostics,
		].map((diagnostic) => {
			const where =
				diagnostic.file === undefined
					? ""
					: `${diagnostic.file.fileName.slice(projectRoot.length + 1)}: `;
			return `${where}TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`;
		});
		expect(diagnostics).toEqual([]);
	});

	it("hobo stub reports each ambient operation, and --check holds the tree", async () => {
		const result = await createHoboCli().run(["stub", "--json"], {
			cwd: projectRoot,
		});
		expect(result.exitCode).toBe(0);
		const envelope = JSON.parse(result.stdout);
		const declared = envelope.data.trainables.filter(
			(stub: { origin: string }) => stub.origin === "declared",
		);
		expect(declared).toEqual([
			{
				methodRef: "Greeter.greet",
				exportName: "greeterGreet",
				contractRef: "decl://Greeter.greet",
				origin: "declared",
			},
		]);
		expect(envelope.data.written).toContain(
			"src/_generated/declared/Greeter.ts",
		);

		const check = await createHoboCli().run(["stub", "--check", "--json"], {
			cwd: projectRoot,
		});
		expect(JSON.parse(check.stdout).ok).toBe(true);

		await rm(join(projectRoot, "src/greeter.ts"));
		const stale = await createHoboCli().run(["stub", "--check", "--json"], {
			cwd: projectRoot,
		});
		const drift = JSON.parse(stale.stdout);
		expect(drift.ok).toBe(false);
		expect(drift.data.detail.drift).toContainEqual(
			expect.objectContaining({
				path: "src/_generated/declared/Greeter.ts",
				status: "extra",
			}),
		);
	});

	it("importing the trainables module registers the operation with its declared shape", async () => {
		await runCodegen({ projectRoot, check: false });
		const mod = await importTrainables(projectRoot);

		expect(isTrainable(mod.greeterGreet)).toBe(true);
		expect(mod.trainableStubs.map((stub) => stub.methodRef)).toContain(
			"Greeter.greet",
		);
		const fact = listTrainables().find(
			(entry) => entry.methodRef === mod.greeterGreet.methodRef,
		);
		expect(fact?.contractRef).toBe("decl://Greeter.greet");
		expect(fact?.intent).toBe("Greet a person by name");
		expect(fact?.baseline).toBe("stub");

		// Signature-only: nothing to serve until a training artifact is applied.
		await expect(mod.greeterGreet("Ada")).rejects.toThrow(
			/no contract examples or applied demos/,
		);
		applyTrainingArtifact(mod.greeterGreet.methodRef, {
			engineId: "hobo.training-engine/built-in-opto@0.1.0",
			engineVersion: "22.0.9",
			methodRef: mod.greeterGreet.methodRef,
			programJson: serializeTrainingArtifactProgram({
				instructions: "Greet warmly.",
				demos: [{ input: "Ada", output: "Hello, Ada!" }],
			}),
		});
		await expect(mod.greeterGreet("Ada")).resolves.toBe("Hello, Ada!");
	});

	it("writes registrations for the ambient class of a file that also holds a decorated one, and none for the decorated one", async () => {
		await writeFile(join(projectRoot, "src/mailbox.ts"), MIXED);
		await runCodegen({ projectRoot, check: false });

		await access(join(projectRoot, "src/_generated/declared/Inbox.ts"));
		await expect(
			access(join(projectRoot, "src/_generated/declared/Outbox.ts")),
		).rejects.toThrow();
		const trainables = await readFile(
			join(projectRoot, "src/_generated/trainables.ts"),
			"utf8",
		);
		expect(trainables).toContain(
			'export { unread as inboxUnread } from "./declared/Inbox.js";',
		);
		expect(trainables).not.toContain("Outbox");
	});

	it("writes registrations for an ambient class whose marker is spelled with an escape", async () => {
		await writeFile(
			join(projectRoot, "src/esc.ts"),
			"@\\u0074rainable\nexport declare class Esc {\n  run(): string;\n}\n",
		);
		await runCodegen({ projectRoot, check: false });
		const declared = await readFile(
			join(projectRoot, "src/_generated/declared/Esc.ts"),
			"utf8",
		);
		expect(declared).toContain("export const run = defineGrounding(");
	});

	it("leaves a decorated class with overloads alone, in its own file or beside an ambient class", async () => {
		await writeFile(join(projectRoot, "src/router.ts"), DECORATED_OVERLOADS);
		await writeFile(
			join(projectRoot, "src/mailbox.ts"),
			MIXED + DECORATED_OVERLOADS.replace("Router", "Relay"),
		);
		const result = await createHoboCli().run(["stub", "--json"], {
			cwd: projectRoot,
		});
		expect(result.exitCode, result.stdout).toBe(0);
		const methodRefs = JSON.parse(result.stdout).data.trainables.map(
			(stub: { methodRef: string }) => stub.methodRef,
		);
		expect(methodRefs).toContain("Inbox.unread");
		expect(methodRefs).not.toContain("Router.route");
		expect(methodRefs).not.toContain("Relay.route");
	});

	it("refuses an ambient class with overloads, also beside a decorated class", async () => {
		await writeFile(
			join(projectRoot, "src/clock.ts"),
			AMBIENT_OVERLOADS + DECORATED,
		);
		const result = await createHoboCli().run(["stub", "--json"], {
			cwd: projectRoot,
		});
		expect(result.exitCode).not.toBe(0);
		const envelope = JSON.parse(result.stdout);
		expect(envelope.code).toBe("HOBO_CODEGEN_SOURCE_PARSE");
		expect(envelope.message).toMatch(/src\/clock\.ts.*Clock\.now/);
	});

	it("refuses an ambient class that shares its name with a decorated class", async () => {
		// src/todos.ts holds the decorated Todos.
		await writeFile(
			join(projectRoot, "src/todos-declared.ts"),
			"@trainable\nexport declare class Todos {\n  list(): string[];\n}\n",
		);
		const result = await createHoboCli().run(["stub", "--json"], {
			cwd: projectRoot,
		});
		expect(result.exitCode).not.toBe(0);
		const envelope = JSON.parse(result.stdout);
		expect(envelope.code).toBe("HOBO_CODEGEN_SOURCE_PARSE");
		expect(envelope.message).toMatch(
			/Ambient @trainable class Todos in src\/todos-declared\.ts shares its name with the decorated @trainable class in src\/todos\.ts/,
		);
	});

	it("rebases a relative runtime module onto the declared module's directory", async () => {
		// declared/<Class>.ts sits one directory below trainables.ts.
		for (const [runtimeModule, fromDeclared] of [
			["./runtime.js", "../runtime.js"],
			["../lib/runtime.js", "../../lib/runtime.js"],
			// A directory's own index, bare.
			[".", ".."],
			["..", "../.."],
			["@acme/runtime", "@acme/runtime"],
		]) {
			const base = defaultCodegenLayout();
			const engine = createProjectCodegenEngine({
				layout: { ...base, imports: { ...base.imports, runtimeModule } },
			});
			await runCodegen({ projectRoot, check: false }, { engine });
			const trainables = await readFile(
				join(projectRoot, "src/_generated/trainables.ts"),
				"utf8",
			);
			expect(trainables).toContain(
				`import { training } from "${runtimeModule}";`,
			);
			const declared = await readFile(
				join(projectRoot, "src/_generated/declared/Greeter.ts"),
				"utf8",
			);
			expect(declared, runtimeModule).toContain(
				`import { defineGrounding } from "${fromDeclared}";`,
			);
		}
	});

	it("refuses an ambient class named like a decorated class whose marker follows a comment ended by a lone CR", async () => {
		// TypeScript ends a line comment at CR, U+2028 and U+2029 as well as LF.
		await writeFile(
			join(projectRoot, "src/greeter-impl.ts"),
			'@// x\rtrainable\nexport class Greeter {\n  greet(): string {\n    return "hi";\n  }\n}\n',
		);
		await expect(runCodegen({ projectRoot, check: false })).rejects.toThrow(
			"Ambient @trainable class Greeter in src/greeter.ts shares its name with the decorated @trainable class in src/greeter-impl.ts",
		);
	});

	it.each(
		NAMED_EVALUATIONS,
	)("refuses an ambient class named like a decorated class expression that %s names", async (_where, place) => {
		await writeFile(
			join(projectRoot, "src/greeter-impl.ts"),
			place(`@trainable class ${CLASS_BODY}`),
		);
		await expect(runCodegen({ projectRoot, check: false })).rejects.toThrow(
			"Ambient @trainable class Greeter in src/greeter.ts shares its name with the decorated @trainable class in src/greeter-impl.ts",
		);
	});

	it.each(
		NAMED_EVALUATIONS,
	)("names a class expression by its own name when it has one, also where %s would name it", async (_where, place) => {
		// Registers Hello.greet, not Greeter.greet: no clash with the ambient Greeter.
		await writeFile(
			join(projectRoot, "src/greeter-impl.ts"),
			place(`@trainable class Hello ${CLASS_BODY}`),
		);
		await runCodegen({ projectRoot, check: false });
		await access(join(projectRoot, "src/_generated/declared/Greeter.ts"));
	});

	it.each(
		UNNAMED_PLACES,
	)("accepts an anonymous decorated class %s, which registers under no binding's name", async (_where, place) => {
		await writeFile(
			join(projectRoot, "src/greeter-impl.ts"),
			place(`@trainable class ${CLASS_BODY}`),
		);
		await runCodegen({ projectRoot, check: false });
		await access(join(projectRoot, "src/_generated/declared/Greeter.ts"));
	});

	it.each(
		NESTED_IN_MARKED,
	)("refuses an ambient class named like a decorated class in %s", async (_where, source) => {
		await writeFile(join(projectRoot, "src/greeter-impl.ts"), source);
		await expect(runCodegen({ projectRoot, check: false })).rejects.toThrow(
			"Ambient @trainable class Greeter in src/greeter.ts shares its name with the decorated @trainable class in src/greeter-impl.ts",
		);
	});

	it("refuses two ambient classes of one name", async () => {
		await writeFile(join(projectRoot, "src/greeter-again.ts"), AMBIENT);
		const result = await createHoboCli().run(["stub", "--json"], {
			cwd: projectRoot,
		});
		expect(result.exitCode).not.toBe(0);
		const envelope = JSON.parse(result.stdout);
		expect(envelope.code).toBe("HOBO_CODEGEN_SOURCE_PARSE");
		expect(envelope.message).toMatch(
			/Greeter is declared in both src\/greeter-again\.ts and src\/greeter\.ts/,
		);
	});

	it("refuses two ambient classes whose names differ only in case", async () => {
		// declared/Foo.ts and declared/FOO.ts are one file on macOS and Windows.
		await writeFile(
			join(projectRoot, "src/foo-a.ts"),
			"@trainable\nexport declare class Foo {\n  a(): string;\n}\n",
		);
		await writeFile(
			join(projectRoot, "src/foo-b.ts"),
			"@trainable\nexport declare class FOO {\n  b(): string;\n}\n",
		);
		await expect(runCodegen({ projectRoot, check: false })).rejects.toThrow(
			/Ambient @trainable classes Foo \(src\/foo-a\.ts\) and FOO \(src\/foo-b\.ts\) differ only in case/,
		);
	});

	it("refuses an ambient class named like a Windows device", async () => {
		for (const name of ["Con", "NUL", "aux", "Com1", "LPT9", "CONIN$"]) {
			await writeFile(
				join(projectRoot, "src/device.ts"),
				`@trainable\nexport declare class ${name} {\n  run(): string;\n}\n`,
			);
			await expect(
				runCodegen({ projectRoot, check: false }),
				name,
			).rejects.toThrow(
				new RegExp(
					`Ambient @trainable class ${name.replace("$", "\\$")} in src/device\\.ts cannot have a registration module: Windows reserves the file name`,
				),
			);
		}
	});

	it("refuses an export name the trainables module already binds", async () => {
		// Trainable.Stubs -> trainableStubs (the manifest); $.training -> training (the import).
		for (const [className, method, exportName] of [
			["Trainable", "Stubs", "trainableStubs"],
			["$", "training", "training"],
		]) {
			await writeFile(
				join(projectRoot, "src/clash.ts"),
				`@trainable\nexport declare class ${className} {\n  ${method}(): string;\n}\n`,
			);
			await expect(
				runCodegen({ projectRoot, check: false }),
				exportName,
			).rejects.toThrow(
				`generates the export ${exportName}, which the trainables module already binds`,
			);
		}
	});

	it('refuses a "use training" function whose import the trainables module already binds', async () => {
		for (const name of ["training", "trainableStubs"]) {
			await writeFile(
				join(projectRoot, "src/clash.ts"),
				`export function ${name}(input: string): string {\n  "use training";\n  return input;\n}\n`,
			);
			await expect(
				runCodegen({ projectRoot, check: false }),
				name,
			).rejects.toThrow(
				`The "use training" function ${name} in src/clash.ts would be imported into the trainables module as ${name}, which`,
			);
		}
	});

	it('refuses two "use training" functions of one name', async () => {
		for (const file of ["src/a.ts", "src/b.ts"]) {
			await writeFile(
				join(projectRoot, file),
				'export function welcome(input: string): string {\n  "use training";\n  return input;\n}\n',
			);
		}
		await expect(runCodegen({ projectRoot, check: false })).rejects.toThrow(
			'The "use training" function welcome in src/b.ts would be imported into the trainables module as welcome, which the import of welcome from src/a.ts already binds',
		);
	});

	it("refuses two exports that camelCase alike once it drops _ and $", async () => {
		// camelCase splits on anything but ASCII letters and digits: A_b.run and AB.run are both aBRun.
		await writeFile(
			join(projectRoot, "src/a-b.ts"),
			"@trainable\nexport declare class A_b {\n  run(): string;\n}\n",
		);
		await writeFile(
			join(projectRoot, "src/ab.ts"),
			"@trainable\nexport declare class AB {\n  run(): string;\n}\n",
		);
		await expect(runCodegen({ projectRoot, check: false })).rejects.toThrow(
			"Trainables A_b.run and AB.run both generate the export aBRun",
		);
	});

	it("refuses an empty export name", async () => {
		await writeFile(
			join(projectRoot, "src/dollar.ts"),
			"@trainable\nexport declare class $ {\n  $(): string;\n}\n",
		);
		await expect(runCodegen({ projectRoot, check: false })).rejects.toThrow(
			'Trainable $.$ generates the export name "", which is not an identifier',
		);
	});

	it("refuses a method its registration module cannot declare", async () => {
		for (const method of ["delete", "default", "defineGrounding"]) {
			await writeFile(
				join(projectRoot, "src/store.ts"),
				`@trainable\nexport declare class Store {\n  ${method}(key: string): string;\n}\n`,
			);
			await expect(
				runCodegen({ projectRoot, check: false }),
				method,
			).rejects.toThrow(
				`Ambient @trainable class Store in src/store.ts has a method named ${method}, which declared/Store.ts cannot export as a const`,
			);
		}
	});

	it("refuses a class name that is not a plain ASCII identifier", async () => {
		// camelCase would drop the letters: Ünï.run -> nRun.
		await writeFile(
			join(projectRoot, "src/unicode.ts"),
			"@trainable\nexport declare class Ünï {\n  run(): string;\n}\n",
		);
		await expect(runCodegen({ projectRoot, check: false })).rejects.toThrow(
			"Ambient @trainable class Ünï in src/unicode.ts is not a plain ASCII identifier",
		);
	});

	it("refuses an ambient operation whose export name a bindle step already takes", async () => {
		// The fixture's bindle has the step incident.classify (export incidentClassify).
		await writeFile(
			join(projectRoot, "src/incident.ts"),
			"@trainable\nexport declare class Incident {\n  classify(id: string): string;\n}\n",
		);
		const result = await createHoboCli().run(["stub", "--json"], {
			cwd: projectRoot,
		});
		expect(result.exitCode).not.toBe(0);
		const envelope = JSON.parse(result.stdout);
		expect(envelope.code).toBe("HOBO_CODEGEN_SOURCE_PARSE");
		expect(envelope.message).toMatch(
			/both generate the export incidentClassify/,
		);
	});
});

async function importTrainables(projectRoot: string): Promise<{
	greeterGreet: Trainable<string, string>;
	trainableStubs: readonly { readonly methodRef: string }[];
}> {
	const moduleUrl = pathToFileURL(
		join(projectRoot, "src/_generated/trainables.ts"),
	).href;
	// SAFETY: the generated trainables module exports these bindings; the test reads them back.
	return (await import(moduleUrl)) as Awaited<
		ReturnType<typeof importTrainables>
	>;
}
