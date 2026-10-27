import { execFile } from "node:child_process";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { runCodegen } from "../src/codegen/run-codegen.js";
import {
	createTypeScriptProjectCodegenEngine,
	packageTypeScriptAppArtifacts,
	selectTypeScriptProjectCodegenEngine,
} from "../src/codegen/typescript-project-engine.js";

async function write(
	root: string,
	path: string,
	content: string,
): Promise<void> {
	await mkdir(join(root, path, ".."), { recursive: true });
	await writeFile(join(root, path), content);
}

async function fixture(root: string): Promise<void> {
	await write(root, "package.json", JSON.stringify({ type: "module" }));
	await write(
		root,
		"tsconfig.json",
		JSON.stringify({
			compilerOptions: {
				target: "ES2022",
				module: "NodeNext",
				moduleResolution: "NodeNext",
				strict: true,
				types: [],
				rootDir: ".",
				outDir: "out",
			},
			include: ["source/**/*.ts"],
		}),
	);
	await write(
		root,
		"source/contracts.ts",
		`
export interface Order { id: string; items: Array<{ sku: string; price: { amount: number; currency: "USD" | "EUR" } }>; delivery?: { address: { city: string }; tags: readonly string[] }; }
export interface Page<T> { entries: T[]; next: string | null; }
`,
	);
	await write(
		root,
		"source/lib.ts",
		`
import type { Order, Page } from "./contracts.js";
export class OrderService {
  private count = 0;
  async submit(order: Order): Promise<Page<Order>> { this.count++; return { entries: [order], next: String(this.count) }; }
}
export function identity<T>(value: T): T { return value; }
`,
	);
	await write(
		root,
		"source/entrypoint.ts",
		`
import { OrderService } from "./lib.js";
export { OrderService, identity as echo } from "./lib.js";
export const service = new OrderService();
export default { async fetch(request: Request): Promise<Response> { return new Response(new URL(request.url).pathname); } };
`,
	);
}

async function compile(root: string): Promise<void> {
	const roots = ts.sys.readDirectory(
		root,
		[".ts"],
		["**/out/**"],
		["source/**/*.ts", "src/_generated/**/*.ts", "consumer.ts"],
	);
	const config = ts.readConfigFile(
		join(root, "tsconfig.json"),
		ts.sys.readFile,
	);
	const parsed = config.error
		? undefined
		: ts.parseJsonConfigFileContent(config.config, ts.sys, root);
	const program = ts.createProgram(roots, {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		strict: true,
		types: [],
		...parsed?.options,
		noEmit: false,
		rootDir: root,
		outDir: join(root, "out"),
	});
	expect(
		ts
			.getPreEmitDiagnostics(program)
			.map((diagnostic) =>
				ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
			),
	).toEqual([]);
	expect(program.emit().emitSkipped).toBe(false);
	await packageTypeScriptAppArtifacts(root, join(root, "out"));
}

async function compilePackagedConsumer(
	root: string,
	source: string,
): Promise<void> {
	const file = join(root, "out/isolated-consumer.mts");
	await write(root, "out/isolated-consumer.mts", source);
	const program = ts.createProgram([file], {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		strict: true,
		types: [],
		noEmit: true,
	});
	expect(
		ts
			.getPreEmitDiagnostics(program)
			.map((diagnostic) =>
				ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
			),
	).toEqual([]);
}

describe("TypeScript app codegen executes the compiler-inferred app contract", {
	timeout: 60_000,
}, () => {
	it("discovers arbitrary source layout, retains imported nested/generic types, compiles and executes classes and HTTP handlers", async () => {
		const root = await mkdtemp(join(tmpdir(), "hobo-ts-imprint-"));
		try {
			await fixture(root);
			const engine = await selectTypeScriptProjectCodegenEngine(root);
			expect(engine).toBeDefined();
			await runCodegen({ projectRoot: root, check: false }, { engine });
			await runCodegen({ projectRoot: root, check: true }, { engine });
			await write(
				root,
				"consumer.ts",
				`
import { app, createAppClient } from "./src/_generated/app-imprint/app.js";
import type { Order, Page } from "./source/contracts.js";
const order: Order = { id: "o1", items: [{ sku: "s1", price: { amount: 3, currency: "EUR" } }], delivery: { address: { city: "Chicago" }, tags: ["fragile"] } };
const result: Promise<Page<Order>> = app["source/entrypoint.ts"].service.submit(order);
const service = new (createAppClient()["source/entrypoint.ts"].OrderService)();
const echoed: Order = app["source/entrypoint.ts"].echo(order);
// @ts-expect-error generated app API retains the nested currency literal union.
app["source/entrypoint.ts"].service.submit({ id: "bad", items: [{ sku: "s1", price: { amount: 1, currency: "GBP" } }] });
void result; void service; void echoed;
`,
			);
			await compile(root);
			// SAFETY: the test compiled these local generated modules and knows their fixture exports.
			const generated = (await import(
				pathToFileURL(join(root, "out/src/_generated/app-imprint/app.js")).href
			)) as {
				createAppClient(): {
					"source/entrypoint.ts": {
						service: {
							submit(order: {
								id: string;
								items: never[];
							}): Promise<{ entries: { id: string }[]; next: string }>;
						};
						default: { fetch(request: Request): Promise<Response> };
						echo<T>(input: T): T;
						OrderService: new () => {
							submit(order: {
								id: string;
								items: never[];
							}): Promise<{ next: string }>;
						};
					};
				};
			};
			const app = generated.createAppClient();
			expect(
				await app["source/entrypoint.ts"].service.submit({
					id: "o1",
					items: [],
				}),
			).toEqual({ entries: [{ id: "o1", items: [] }], next: "1" });
			expect(
				await new app["source/entrypoint.ts"].OrderService().submit({
					id: "o2",
					items: [],
				}),
			).toMatchObject({ next: "1" });
			expect(
				app["source/entrypoint.ts"].echo({ nested: { values: [1, 2] } }),
			).toEqual({ nested: { values: [1, 2] } });
			expect(
				await (
					await app["source/entrypoint.ts"].default.fetch(
						new Request("https://app.example/orders"),
					)
				).text(),
			).toBe("/orders");
			const manifest = JSON.parse(
				await readFile(
					join(root, ".hobo/generated/app-imprint/codegen-manifest.json"),
					"utf8",
				),
			);
			expect(manifest.sourceDigests["source/contracts.ts"]).toMatch(/^sha256:/);
			await write(
				root,
				"source/contracts.ts",
				"export interface Order { changed: true }; export interface Page<T> { entries: T[] };\n",
			);
			await expect(
				runCodegen({ projectRoot: root, check: true }, { engine }),
			).rejects.toMatchObject({ code: "HOBO_CODEGEN_SOURCE_PARSE" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("does not evaluate app modules during imprinting and reports source type errors before writes", async () => {
		const root = await mkdtemp(join(tmpdir(), "hobo-ts-imprint-invalid-"));
		try {
			await write(
				root,
				"app.ts",
				`throw new Error("must not execute during generation"); export const value = 1;`,
			);
			const engine = createTypeScriptProjectCodegenEngine();
			await expect(
				runCodegen({ projectRoot: root, check: false }, { engine }),
			).resolves.toMatchObject({ mode: "write" });
			await write(root, "app.ts", `export const value: string = 1;`);
			await expect(
				runCodegen({ projectRoot: root, check: false }, { engine }),
			).rejects.toMatchObject({ code: "HOBO_CODEGEN_SOURCE_PARSE" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	it("handles module-flavored entrypoints and overloaded exports", async () => {
		const root = await mkdtemp(join(tmpdir(), "hobo-ts-imprint-flavors-"));
		try {
			await write(root, "package.json", JSON.stringify({ type: "module" }));
			await write(
				root,
				"api.mts",
				`export function describe(value: string): string; export function describe(value: number): number; export function describe(value: string | number): string | number { return value; }`,
			);
			await write(
				root,
				"legacy.cts",
				`export function run(value: number) { return value * 2; }`,
			);
			await runCodegen(
				{ projectRoot: root, check: false },
				{ engine: createTypeScriptProjectCodegenEngine() },
			);
			await compile(root);
			// SAFETY: fixture exports are compiled above and invoked via their generated module names.
			const generated = (await import(
				pathToFileURL(join(root, "out/src/_generated/app-imprint/app.js")).href
			)) as {
				app: {
					"api.mts": { describe(value: string | number): string | number };
					"legacy.cts": { run(value: number): number };
				};
			};
			expect(generated.app["api.mts"].describe("typed")).toBe("typed");
			expect(generated.app["api.mts"].describe(4)).toBe(4);
			expect(generated.app["legacy.cts"].run(4)).toBe(8);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	it("imprints and invokes a real exported Bindle app without a JSON source model", async () => {
		const root = await mkdtemp(join(tmpdir(), "hobo-ts-imprint-bindle-"));
		try {
			await write(root, "package.json", JSON.stringify({ type: "module" }));
			await mkdir(join(root, "node_modules/@hobo"), { recursive: true });
			await symlink(
				fileURLToPath(new URL("../../bindles", import.meta.url)),
				join(root, "node_modules/@hobo/bindles"),
				"dir",
			);
			await write(
				root,
				"source/bindle.ts",
				`import { bindle } from "@hobo/bindles"; export default bindle("compiler-app", b => ({ api: b.api(() => ({ fetch(request: Request) { return new Response("bindle:" + new URL(request.url).pathname); } })) }));`,
			);
			const engine = createTypeScriptProjectCodegenEngine();
			await runCodegen({ projectRoot: root, check: false }, { engine });
			await compile(root);
			// SAFETY: the fixture's default export is an actual Bindle with an api HTTP entrypoint.
			const generated = (await import(
				pathToFileURL(join(root, "out/src/_generated/app-imprint/app.js")).href
			)) as {
				app: {
					"source/bindle.ts": {
						default: {
							name: string;
							entrypoint(
								name: string,
							): () => { fetch(request: Request): Response };
						};
					};
				};
			};
			const definition = generated.app["source/bindle.ts"].default;
			expect(definition.name).toBe("compiler-app");
			expect(
				await definition
					.entrypoint("api")()
					.fetch(new Request("https://app.example/orders"))
					.text(),
			).toBe("bindle:/orders");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	it("preserves preexisting generated models consumed by the app across regeneration", async () => {
		const root = await mkdtemp(join(tmpdir(), "hobo-ts-imprint-owned-roots-"));
		try {
			await write(root, "package.json", JSON.stringify({ type: "module" }));
			const model = "export const settings = {nested: {enabled: true}};\n";
			await write(root, "src/_generated/model.ts", model);
			await write(
				root,
				"source/app.ts",
				`import {settings} from "../src/_generated/model.js"; export function run() {return settings.nested.enabled;}`,
			);
			await write(
				root,
				".hobo/generated/other-tool.json",
				'{"ownedBy":"other"}\n',
			);
			const engine = createTypeScriptProjectCodegenEngine();
			await runCodegen({ projectRoot: root, check: false }, { engine });
			await runCodegen({ projectRoot: root, check: false }, { engine });
			await runCodegen({ projectRoot: root, check: true }, { engine });
			expect(
				await readFile(join(root, "src/_generated/model.ts"), "utf8"),
			).toBe(model);
			expect(
				await readFile(join(root, ".hobo/generated/other-tool.json"), "utf8"),
			).toContain("other");
			await compile(root);
			// SAFETY: fixture handler returns the generated model's literal boolean.
			const generated = (await import(
				pathToFileURL(join(root, "out/src/_generated/app-imprint/app.js")).href
			)) as { app: { "source/app.ts": { run(): boolean } } };
			expect(generated.app["source/app.ts"].run()).toBe(true);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	it("composes ambient trainable registrations and executes an applied artifact through the generated namespace", async () => {
		const root = await mkdtemp(join(tmpdir(), "hobo-ts-imprint-training-"));
		try {
			await write(root, "package.json", JSON.stringify({ type: "module" }));
			await mkdir(join(root, "node_modules/@hobo"), { recursive: true });
			await mkdir(join(root, "node_modules/@types"), { recursive: true });
			await symlink(
				fileURLToPath(
					new URL("../../../node_modules/@types/node", import.meta.url),
				),
				join(root, "node_modules/@types/node"),
				"dir",
			);
			for (const name of ["runtime", "core"])
				await symlink(
					fileURLToPath(new URL(`../../${name}`, import.meta.url)),
					join(root, `node_modules/@hobo/${name}`),
					"dir",
				);
			await write(
				root,
				"source/greeter.ts",
				`declare const trainable: ClassDecorator; @trainable export declare class Greeter { greet(name: string): string; }`,
			);
			await write(
				root,
				"source/runtime.ts",
				`export { applyTrainingArtifact, getTrainable } from "@hobo/runtime"; export { serializeTrainingArtifactProgram } from "@hobo/core";`,
			);
			const engine = createTypeScriptProjectCodegenEngine();
			await runCodegen({ projectRoot: root, check: false }, { engine });
			expect(await engine.describeTrainables?.(root)).toEqual([
				expect.objectContaining({
					methodRef: "Greeter.greet",
					exportName: "greeterGreet",
					origin: "declared",
				}),
			]);
			const generatedFile = join(root, "src/_generated/app-imprint/app.ts");
			const program = ts.createProgram([generatedFile], {
				target: ts.ScriptTarget.ES2022,
				module: ts.ModuleKind.NodeNext,
				moduleResolution: ts.ModuleResolutionKind.NodeNext,
				strict: true,
				types: ["node"],
				rootDir: root,
				outDir: join(root, "out"),
			});
			expect(
				ts
					.getPreEmitDiagnostics(program)
					.map((diagnostic) =>
						ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
					),
			).toEqual([]);
			program.emit();
			await packageTypeScriptAppArtifacts(root, join(root, "out"));
			// SAFETY: local generated modules were compiled above; the runtime helpers are reexports of the production engines.
			const generated = (await import(
				pathToFileURL(join(root, "out/src/_generated/app-imprint/app.js")).href
			)) as {
				app: {
					trainables: {
						greeterGreet: {
							(input: string): Promise<string>;
							methodRef: string;
						};
					};
					"source/runtime.ts": Pick<
						typeof import("@hobo/runtime"),
						"applyTrainingArtifact" | "getTrainable"
					> &
						Pick<
							typeof import("@hobo/core"),
							"serializeTrainingArtifactProgram"
						>;
				};
			};
			const operation = generated.app.trainables.greeterGreet;
			const runtime = generated.app["source/runtime.ts"];
			runtime.applyTrainingArtifact(operation.methodRef, {
				engineId: "hobo.training-engine/built-in-opto@0.1.0",
				engineVersion: "22.0.9",
				methodRef: operation.methodRef,
				programJson: runtime.serializeTrainingArtifactProgram({
					instructions: "Greet warmly",
					demos: [{ input: "Ada", output: "Hello, Ada!" }],
				}),
			});
			expect(await operation("Ada")).toBe("Hello, Ada!");
			expect(runtime.getTrainable(operation.methodRef)?.calls).toContainEqual(
				expect.objectContaining({
					input: "Ada",
					output: "Hello, Ada!",
					served: "matched-demo",
				}),
			);
			const bindings = await readFile(
				join(root, "src/_generated/app-imprint/bindings.ts"),
				"utf8",
			);
			expect(bindings).toContain(
				'"methodRef":"Greeter.greet","exportName":"greeterGreet"',
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects unimplemented ambient value exports rather than generating a success with missing APIs", async () => {
		const root = await mkdtemp(
			join(tmpdir(), "hobo-ts-imprint-missing-runtime-"),
		);
		try {
			await write(
				root,
				"source/app.ts",
				"export declare function charge(amount: number): Promise<string>; export const unrelated = 1;",
			);
			await expect(
				runCodegen(
					{ projectRoot: root, check: false },
					{ engine: createTypeScriptProjectCodegenEngine() },
				),
			).rejects.toThrow("ambient value with no runtime implementation");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	it("executes tsconfig aliases, local package barrels, const enums and namespace exports", async () => {
		const root = await mkdtemp(join(tmpdir(), "hobo-ts-imprint-alias-"));
		try {
			await write(root, "package.json", JSON.stringify({ type: "module" }));
			await write(
				root,
				"tsconfig.json",
				JSON.stringify({
					compilerOptions: {
						target: "ES2022",
						module: "ESNext",
						moduleResolution: "Bundler",
						strict: true,
						types: [],
						baseUrl: ".",
						paths: {
							"@domain/*": ["packages/domain/*"],
							"@app/*": ["source/*"],
						},
					},
					include: ["source/**/*.ts", "packages/**/*.ts"],
				}),
			);
			await write(
				root,
				"packages/domain/package.json",
				JSON.stringify({ name: "@local/domain", type: "module" }),
			);
			await write(
				root,
				"packages/domain/types.ts",
				`export const enum Status { Ready = 3, Done = Ready + 2 }; export namespace Prices { export function total(items: readonly {price: number; count: number}[]): number { return items.reduce((sum, item) => sum + item.price * item.count, 0); } }`,
			);
			await write(
				root,
				"packages/domain/index.ts",
				`export { Status, Prices } from "./types.js";`,
			);
			await write(
				root,
				"source/service.ts",
				`import {Status, Prices} from "@domain/index"; export function calculate(items: readonly {price: number; count: number}[]) { return {status: Status.Done, total: Prices.total(items)}; }`,
			);
			await write(
				root,
				"source/app.ts",
				`export {calculate as quote} from "@app/service"; export {Status, Prices} from "@domain/index";`,
			);
			const engine = await selectTypeScriptProjectCodegenEngine(root);
			await runCodegen({ projectRoot: root, check: false }, { engine });
			await compile(root);
			// SAFETY: generated client compiles from these actual project-local implementations above.
			const generated = (await import(
				pathToFileURL(join(root, "out/src/_generated/app-imprint/app.js")).href
			)) as {
				app: {
					"source/app.ts": {
						quote(items: readonly { price: number; count: number }[]): {
							status: number;
							total: number;
						};
						Status: { Ready: number; Done: number };
						Prices: {
							total(items: readonly { price: number; count: number }[]): number;
						};
					};
				};
			};
			const app = generated.app["source/app.ts"];
			expect(app.quote([{ price: 7, count: 3 }])).toEqual({
				status: 5,
				total: 21,
			});
			expect(app.Status.Ready).toBe(3);
			expect(app.Status.Done).toBe(5);
			expect(app.Prices.total([{ price: 4, count: 2 }])).toBe(8);
			await write(
				root,
				"out/verify.mjs",
				`import {app} from "./src/_generated/app-imprint/app.js"; const service = app["source/app.ts"]; process.stdout.write(JSON.stringify({quote: service.quote([{price: 6,count: 4}]), ready: service.Status.Ready, total: service.Prices.total([{price: 2,count: 3}])}));`,
			);
			await rm(join(root, "source"), { recursive: true, force: true });
			await rm(join(root, "packages"), { recursive: true, force: true });
			await rm(join(root, "src"), { recursive: true, force: true });
			const native = await promisify(execFile)(
				process.execPath,
				[join(root, "out/verify.mjs")],
				{ env: {} },
			);
			expect(JSON.parse(native.stdout)).toEqual({
				quote: { status: 5, total: 24 },
				ready: 3,
				total: 6,
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	it("bundles compiler-resolved workspace sibling aliases outside the app directory", async () => {
		const workspace = await mkdtemp(
			join(tmpdir(), "hobo-ts-imprint-workspace-"),
		);
		const root = join(workspace, "apps/shop");
		try {
			await write(root, "package.json", JSON.stringify({ type: "module" }));
			await write(
				root,
				"tsconfig.json",
				JSON.stringify({
					compilerOptions: {
						target: "ES2022",
						module: "ESNext",
						moduleResolution: "Bundler",
						strict: true,
						types: [],
						baseUrl: ".",
						paths: { "@pricing/*": ["../../packages/pricing/*"] },
					},
					include: ["source/**/*.ts"],
				}),
			);
			await write(
				workspace,
				"packages/pricing/index.ts",
				`export function calculate(unitPrice: number, count: number): number { return unitPrice * count; }`,
			);
			await write(
				root,
				"source/app.ts",
				`import {calculate} from "@pricing/index"; export const quote = (unitPrice: number, count: number) => calculate(unitPrice, count);`,
			);
			await runCodegen(
				{ projectRoot: root, check: false },
				{ engine: createTypeScriptProjectCodegenEngine() },
			);
			const config = ts.readConfigFile(
				join(root, "tsconfig.json"),
				ts.sys.readFile,
			);
			const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
			const program = ts.createProgram(
				[join(root, "src/_generated/app-imprint/app.ts")],
				{
					...parsed.options,
					rootDir: workspace,
					outDir: join(workspace, "out"),
				},
			);
			expect(
				ts
					.getPreEmitDiagnostics(program)
					.map((diagnostic) =>
						ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
					),
			).toEqual([]);
			program.emit();
			await packageTypeScriptAppArtifacts(
				root,
				join(workspace, "out/apps/shop"),
			);
			// SAFETY: this client was compiled from the fixture and its actual sibling dependency was bundled above.
			const generated = (await import(
				pathToFileURL(
					join(workspace, "out/apps/shop/src/_generated/app-imprint/app.js"),
				).href
			)) as {
				app: {
					"source/app.ts": { quote(unitPrice: number, count: number): number };
				};
			};
			expect(generated.app["source/app.ts"].quote(7, 4)).toBe(28);
		} finally {
			await rm(workspace, { recursive: true, force: true });
		}
	});
	it.each([
		"missing",
		"invalid",
	])("uses canonical source overlays for a %s imported seed without mutating authored inputs during generation", async (state) => {
		const root = await mkdtemp(join(tmpdir(), "hobo-ts-imprint-overlay-"));
		try {
			await write(root, "package.json", JSON.stringify({ type: "module" }));
			await write(
				root,
				"tsconfig.json",
				JSON.stringify({
					compilerOptions: {
						target: "ES2022",
						module: "ESNext",
						moduleResolution: "Bundler",
						strict: true,
						types: [],
						allowImportingTsExtensions: true,
						noEmit: true,
					},
					include: ["app.ts", "src/**/*.ts"],
				}),
			);
			const authored = `import {calculate} from "./src/_generated/index.ts"; export function run(items: readonly {price: number; count: number}[]) {return calculate(items);}`;
			const canonical =
				"export function calculate(items: readonly {price: number; count: number}[]): number {return items.reduce((sum,item) => sum + item.price * item.count, 0);}";
			await write(root, "app.ts", authored);
			if (state === "invalid")
				await write(root, "src/_generated/index.ts", "const [broken seed");
			const engine = createTypeScriptProjectCodegenEngine({
				sourceOverrides: { "src/_generated/index.ts": canonical },
			});
			await runCodegen({ projectRoot: root, check: false }, { engine });
			await runCodegen({ projectRoot: root, check: true }, { engine });
			expect(await readFile(join(root, "app.ts"), "utf8")).toBe(authored);
			if (state === "invalid")
				expect(
					await readFile(join(root, "src/_generated/index.ts"), "utf8"),
				).toBe("const [broken seed");
			else
				await expect(
					readFile(join(root, "src/_generated/index.ts"), "utf8"),
				).rejects.toMatchObject({ code: "ENOENT" });
			// SAFETY: executable generated bundle is built from the trusted canonical seed plus this fixture's app.
			const generated = (await import(
				pathToFileURL(
					join(root, "src/_generated/app-imprint/runtime/appModule0.mjs"),
				).href
			)) as { run(items: readonly { price: number; count: number }[]): number };
			expect(
				generated.run([
					{ price: 7, count: 3 },
					{ price: 2, count: 4 },
				]),
			).toBe(29);
			const manifest = JSON.parse(
				await readFile(
					join(root, ".hobo/generated/app-imprint/codegen-manifest.json"),
					"utf8",
				),
			);
			expect(manifest.sourceDigests["src/_generated/index.ts"]).toBeDefined();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	it("preserves binary file-loader assets through codegen drift checks and native artifact packaging with CSS and JSON imports", async () => {
		const root = await mkdtemp(join(tmpdir(), "hobo-ts-imprint-assets-"));
		try {
			await write(root, "package.json", JSON.stringify({ type: "module" }));
			await write(
				root,
				"tsconfig.json",
				JSON.stringify({
					compilerOptions: {
						target: "ES2022",
						module: "ESNext",
						moduleResolution: "Bundler",
						strict: true,
						types: [],
						resolveJsonModule: true,
					},
					include: ["source/**/*.ts"],
				}),
			);
			await write(
				root,
				"source/assets.d.ts",
				'declare module "*.png" { const url: string; export default url; } declare module "*.wasm" { const url: string; export default url; } declare module "*.css";',
			);
			await write(
				root,
				"source/config.json",
				JSON.stringify({ theme: { title: "imported config" } }),
			);
			await write(
				root,
				"source/styles.css",
				'.logo { background-image: url("./logo.png"); color: red; }',
			);
			const image = new Uint8Array([
				0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x80,
				0x42,
			]);
			const wasm = new Uint8Array([
				0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
			]);
			await writeFile(join(root, "source/logo.png"), image);
			await writeFile(join(root, "source/module.wasm"), wasm);
			await write(
				root,
				"source/app.ts",
				'import image from "./logo.png"; import wasm from "./module.wasm"; import config from "./config.json"; import "./styles.css"; export function assets() { return {image, wasm, title: config.theme.title}; }',
			);
			const engine = createTypeScriptProjectCodegenEngine({
				entrypoints: ["source/app.ts"],
			});
			const artifacts = await engine.generate(root);
			expect(
				artifacts.find((artifact) => artifact.path.endsWith(".png"))
					?.binaryContent,
			).toEqual(image);
			expect(
				artifacts.find((artifact) => artifact.path.endsWith(".wasm"))
					?.binaryContent,
			).toEqual(wasm);
			const generated = await runCodegen(
				{ projectRoot: root, check: false },
				{ engine },
			);
			await runCodegen({ projectRoot: root, check: true }, { engine });
			const asset = generated.written.find((path) => path.endsWith(".png"));
			expect(asset).toBeDefined();
			if (!asset) throw new Error("Expected emitted PNG asset");
			expect(new Uint8Array(await readFile(join(root, asset)))).toEqual(image);
			await writeFile(join(root, asset), new Uint8Array([...image, 0x00]));
			await expect(
				runCodegen({ projectRoot: root, check: true }, { engine }),
			).rejects.toMatchObject({ code: "HOBO_CODEGEN_DRIFT" });
			await runCodegen({ projectRoot: root, check: false }, { engine });
			await compile(root);
			// SAFETY: real TS/asset imports above were bundled and the executable client was compiled and packaged.
			const client = (await import(
				pathToFileURL(join(root, "out/src/_generated/app-imprint/app.js")).href
			)) as {
				app: {
					"source/app.ts": {
						assets(): { image: string; wasm: string; title: string };
					};
				};
				resolveAppAsset(path: string): URL;
			};
			const values = client.app["source/app.ts"].assets();
			expect(values.title).toBe("imported config");
			expect(
				new Uint8Array(await readFile(client.resolveAppAsset(values.image))),
			).toEqual(image);
			expect(
				new Uint8Array(await readFile(client.resolveAppAsset(values.wasm))),
			).toEqual(wasm);
			expect(generated.written.some((path) => path.endsWith(".css"))).toBe(
				true,
			);
			await rm(join(root, "source"), { recursive: true, force: true });
			await rm(join(root, "src"), { recursive: true, force: true });
			await compilePackagedConsumer(
				root,
				`import {app} from "./src/_generated/app-imprint/app.js"; const assets: {image:string;wasm:string;title:string} = app["source/app.ts"].assets(); void assets;`,
			);
			const packagedValues = client.app["source/app.ts"].assets();
			expect(
				new Uint8Array(
					await readFile(client.resolveAppAsset(packagedValues.image)),
				),
			).toEqual(image);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	}, 30_000);
	it("preserves true CommonJS export-assignment callables, constructors and namespace properties", async () => {
		const root = await mkdtemp(
			join(tmpdir(), "hobo-ts-imprint-export-equals-"),
		);
		try {
			await write(root, "package.json", JSON.stringify({ type: "module" }));
			await write(
				root,
				"legacy.cts",
				`function calculate(value: number): number {return value * 3;} namespace calculate {export const version = "v1";} export = calculate;`,
			);
			await write(
				root,
				"counter.cts",
				`class Counter { private count = 0; add(value: number) { this.count += value; return this.count; } } export = Counter;`,
			);
			await write(
				root,
				"object.cts",
				`const api = {quote: (price: number, count: number) => price * count}; export = api;`,
			);
			const engine = await selectTypeScriptProjectCodegenEngine(root);
			await runCodegen({ projectRoot: root, check: false }, { engine });
			await compile(root);
			await write(
				root,
				"out/verify.mjs",
				`import {app} from "./src/_generated/app-imprint/app.js"; const counter = new app["counter.cts"](); process.stdout.write(JSON.stringify({value: app["legacy.cts"](4), version: app["legacy.cts"].version, first: counter.add(2), next: counter.add(5), quote: app["object.cts"].quote(7,3)}));`,
			);
			await rm(join(root, "legacy.cts"));
			await rm(join(root, "counter.cts"));
			await rm(join(root, "object.cts"));
			await rm(join(root, "src"), { recursive: true, force: true });
			await compilePackagedConsumer(
				root,
				`import {app} from "./src/_generated/app-imprint/app.js"; const count: number = new app["counter.cts"]().add(3); const value: number = app["legacy.cts"](4); const version: "v1" = app["legacy.cts"].version; const quote: number = app["object.cts"].quote(2,5); void count; void value; void version; void quote; // @ts-expect-error preserved parameter type
app["legacy.cts"]("wrong");`,
			);

			const native = await promisify(execFile)(
				process.execPath,
				[join(root, "out/verify.mjs")],
				{ env: {} },
			);
			expect(JSON.parse(native.stdout)).toEqual({
				value: 12,
				version: "v1",
				first: 2,
				next: 7,
				quote: 21,
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("executes a packaged complex generic/class/overloaded/namespace app with aliases, top-level await and dynamic imports in plain Node", async () => {
		const root = await mkdtemp(
			join(tmpdir(), "hobo-ts-imprint-complex-native-"),
		);
		try {
			await write(root, "package.json", JSON.stringify({ type: "module" }));
			await write(
				root,
				"tsconfig.json",
				JSON.stringify({
					compilerOptions: {
						target: "ES2022",
						module: "ESNext",
						moduleResolution: "Bundler",
						strict: true,
						types: [],
						baseUrl: ".",
						paths: { "@domain/*": ["source/domain/*"] },
					},
					include: ["source/**/*.ts"],
				}),
			);
			await write(
				root,
				"source/domain/prices.ts",
				`(globalThis as typeof globalThis & {priceLoads?: number}).priceLoads = ((globalThis as typeof globalThis & {priceLoads?: number}).priceLoads ?? 0) + 1; export function price(items: readonly {unit: number; count: number}[]) {return items.reduce((total,item)=>total+item.unit*item.count,0);}`,
			);
			await write(
				root,
				"source/operations.ts",
				`
export function mapBox<T,U>(box: {value: T}, convert: (value: T) => U): {value: U} {return {value: convert(box.value)};}
export function describe(value: string): {kind: "text"; value: string};
export function describe(value: number): {kind: "number"; value: number};
export function describe(value: string | number) {return typeof value === "string" ? {kind: "text", value} : {kind: "number", value};}
export class Ledger { #total = 0; record(value: number) {this.#total += value; return this.#total;} }
export namespace Checks {export function positive(value: number) {return value > 0;}}
export const initialized = await Promise.resolve({version: 2});
export async function lazyTotal(items: readonly {unit: number; count: number}[]) {const prices = await import("@domain/prices"); return prices.price(items);}
`,
			);
			await write(
				root,
				"source/app.ts",
				`import {Ledger} from "./operations.js"; export {mapBox, describe, Ledger, Checks, initialized, lazyTotal} from "./operations.js"; export const ledger = new Ledger();`,
			);
			await runCodegen(
				{ projectRoot: root, check: false },
				{ engine: createTypeScriptProjectCodegenEngine() },
			);
			await write(
				root,
				"consumer.ts",
				`import {app} from "./src/_generated/app-imprint/app.js"; const client = app["source/app.ts"]; const mapped: {value: string} = client.mapBox({value: {nested: {amount: 3}}}, value => String(value.nested.amount)); const text: {kind: "text"; value: string} = client.describe("typed"); const numeric: {kind: "number"; value: number} = client.describe(4); void mapped; void text; void numeric;`,
			);
			await compile(root);
			await write(
				root,
				"out/verify.mjs",
				`import {app} from "./src/_generated/app-imprint/app.js"; const client=app["source/app.ts"]; const beforeLazy=globalThis.priceLoads ?? 0; const lazy=await client.lazyTotal([{unit:6,count:4},{unit:2,count:3}]); const again=await client.lazyTotal([]); const first=client.ledger.record(4), next=client.ledger.record(7); process.stdout.write(JSON.stringify({mapped: client.mapBox({value:{nested:{amount:3}}}, value=>value.nested.amount*5), text: client.describe("native"), number: client.describe(9), first, next, classIdentity: client.ledger instanceof client.Ledger, valid: client.Checks.positive(next), initialized: client.initialized, lazy, again, beforeLazy, priceLoads: globalThis.priceLoads, modulePaths: Object.keys(app)}));`,
			);
			await rm(join(root, "source"), { recursive: true, force: true });
			await rm(join(root, "src"), { recursive: true, force: true });
			await compilePackagedConsumer(
				root,
				`import {app} from "./src/_generated/app-imprint/app.js"; const api = app["source/app.ts"]; const box: {value: number} = api.mapBox({value: {nested: {value: 3}}}, value => value.nested.value); const text: {kind:"text";value:string} = api.describe("typed"); const ledger = new api.Ledger(); const total: number = ledger.record(2); void box; void text; void total; // @ts-expect-error private state stays private
ledger.total; // @ts-expect-error overload remains exact
api.describe(false);`,
			);
			const native = await promisify(execFile)(
				process.execPath,
				[join(root, "out/verify.mjs")],
				{ env: {} },
			);
			expect(JSON.parse(native.stdout)).toEqual({
				mapped: { value: 15 },
				text: { kind: "text", value: "native" },
				number: { kind: "number", value: 9 },
				first: 4,
				next: 11,
				classIdentity: true,
				valid: true,
				initialized: { version: 2 },
				lazy: 30,
				again: 0,
				beforeLazy: 0,
				priceLoads: 1,
				modulePaths: ["source/app.ts"],
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it.each([
		"graph",
		"package",
		"explicit",
	] as const)("executes %s application roots without exposing dependency modules or losing cyclic components", async (selection) => {
		const root = await mkdtemp(join(tmpdir(), "hobo-ts-imprint-roots-"));
		try {
			await write(
				root,
				"package.json",
				JSON.stringify(
					selection === "package"
						? {
								type: "module",
								exports: {
									".": {
										types: "./dist/public.d.ts",
										import: "./dist/public.js",
										require: "./dist/cycle-b.js",
									},
								},
							}
						: { type: "module" },
				),
			);
			await write(
				root,
				"tsconfig.json",
				JSON.stringify({
					compilerOptions: {
						target: "ES2022",
						module: "NodeNext",
						moduleResolution: "NodeNext",
						strict: true,
						types: [],
						rootDir: "source",
						outDir: "dist",
					},
					include: ["source/**/*.ts"],
				}),
			);
			await write(
				root,
				"source/cycle-a.ts",
				`import {suffix} from "./cycle-b.js"; export function prefix() {return "cyclic";} export function runCycle() {return prefix()+suffix();}`,
			);
			await write(
				root,
				"source/cycle-b.ts",
				`import {prefix} from "./cycle-a.js"; export function suffix() {return ":"+prefix();}`,
			);
			await write(
				root,
				"source/dependency.ts",
				`export function answer() {return 42;}`,
			);
			await write(
				root,
				"source/public.ts",
				`export {answer} from "./dependency.js";`,
			);
			await write(
				root,
				"source/types.ts",
				`import type {answer} from "./public.js"; import type {runCycle} from "./cycle-a.js"; export interface Contracts {answer: typeof answer; cycle: typeof runCycle;}`,
			);
			await runCodegen(
				{ projectRoot: root, check: false },
				{
					engine: createTypeScriptProjectCodegenEngine(
						selection === "explicit"
							? { entrypoints: ["source/public.ts", "source/cycle-b.ts"] }
							: {},
					),
				},
			);
			await compile(root);
			await write(
				root,
				"out/verify.mjs",
				`import {app} from "./src/_generated/app-imprint/app.js"; process.stdout.write(JSON.stringify({paths: Object.keys(app), answer: app["source/public.ts"].answer(), cyclic: app["source/cycle-a.ts"]?.runCycle() ?? app["source/cycle-b.ts"]?.suffix() ?? null}));`,
			);
			await rm(join(root, "source"), { recursive: true, force: true });
			await rm(join(root, "src"), { recursive: true, force: true });
			const native = await promisify(execFile)(
				process.execPath,
				[join(root, "out/verify.mjs")],
				{ env: {} },
			);
			expect(JSON.parse(native.stdout)).toEqual({
				paths:
					selection === "graph"
						? ["source/cycle-a.ts", "source/public.ts"]
						: selection === "package"
							? ["source/public.ts"]
							: ["source/public.ts", "source/cycle-b.ts"],
				answer: 42,
				cyclic:
					selection === "graph"
						? "cyclic:cyclic"
						: selection === "package"
							? null
							: ":cyclic",
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	it("preserves checker-derived decorator metadata for imported classes in native packaged execution without evaluating during codegen", async () => {
		const root = await mkdtemp(join(tmpdir(), "hobo-ts-metadata-"));
		try {
			await write(root, "package.json", JSON.stringify({ type: "module" }));
			await write(
				root,
				"tsconfig.json",
				JSON.stringify({
					compilerOptions: {
						target: "ES2022",
						module: "NodeNext",
						moduleResolution: "NodeNext",
						strict: true,
						types: [],
						experimentalDecorators: true,
						emitDecoratorMetadata: true,
					},
					include: ["source/**/*.ts"],
				}),
			);
			await write(
				root,
				"source/dependency.ts",
				`export class Dependency {constructor(readonly name: string) {}}`,
			);
			await write(
				root,
				"source/reflection.ts",
				`const values = new WeakMap<object, Map<string, unknown>>(); Object.defineProperty(Reflect, "metadata", {value(key:string, value:unknown) {return (target:object, property?:string) => {const entries = values.get(target) ?? new Map<string,unknown>(); entries.set(String(property)+":"+key,value); values.set(target,entries);};}}); Reflect.set(globalThis,"__hoboMetadataLoaded",true); export function metadata(target:object, key:string, property?:string):unknown {return values.get(target)?.get(String(property)+":"+key);}`,
			);
			await write(
				root,
				"source/controller.ts",
				`import "./reflection.js"; import {Dependency} from "./dependency.js"; function classMark(value:Function):void {void value;} function memberMark(target:object,key:string):void {void target;void key;} @classMark export class Controller {@memberMark field!: Dependency; constructor(readonly dependency: Dependency) {} @memberMark invoke(value:Dependency): Dependency {return value;}}`,
			);
			await write(
				root,
				"source/app.ts",
				`export {Controller} from "./controller.js"; export {Dependency} from "./dependency.js"; export {metadata} from "./reflection.js";`,
			);
			expect(Reflect.has(globalThis, "__hoboMetadataLoaded")).toBe(false);
			await runCodegen(
				{ projectRoot: root, check: false },
				{ engine: createTypeScriptProjectCodegenEngine() },
			);
			expect(Reflect.has(globalThis, "__hoboMetadataLoaded")).toBe(false);
			await compile(root);
			await write(
				root,
				"out/verify.mjs",
				`import {app} from "./src/_generated/app-imprint/app.js"; const {Controller,Dependency,metadata}=app["source/app.ts"]; const dependency=new Dependency("actual"); const controller=new Controller(dependency); process.stdout.write(JSON.stringify({constructor:metadata(Controller,"design:paramtypes")[0]===Dependency, property:metadata(Controller.prototype,"design:type","field")===Dependency, method:metadata(Controller.prototype,"design:paramtypes","invoke")[0]===Dependency, returns:metadata(Controller.prototype,"design:returntype","invoke")===Dependency, result:controller.invoke(dependency).name}));`,
			);
			await rm(join(root, "source"), { recursive: true, force: true });
			await rm(join(root, "src"), { recursive: true, force: true });
			await compilePackagedConsumer(
				root,
				`import {app} from "./src/_generated/app-imprint/app.js"; const {Controller,Dependency}=app["source/app.ts"]; const controller = new Controller(new Dependency("typed")); const name: string = controller.invoke(new Dependency("typed")).name; void name;`,
			);
			const native = await promisify(execFile)(
				process.execPath,
				[join(root, "out/verify.mjs")],
				{ env: {} },
			);
			expect(JSON.parse(native.stdout)).toEqual({
				constructor: true,
				property: true,
				method: true,
				returns: true,
				result: "actual",
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
