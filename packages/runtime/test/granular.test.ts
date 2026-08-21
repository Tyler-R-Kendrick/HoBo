import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import {
	description,
	generateDeclaredRegistrations,
	getTrainable,
	intent,
	resetTrainables,
	resolveDeclared,
	returns,
	scanDeclaredTrainables,
	trainable,
	training,
} from "../src/index.js";
import type { JsonValue } from "../src/json.js";

afterEach(() => {
	resetTrainables();
});

interface DecoratorBag {
	readonly kind: string;
}

function decoratorContext<T>(bag: DecoratorBag): T {
	// SAFETY: TC39 decorator context bag at this test boundary.
	return bag as never;
}

// ---------------------------------------------------------------------------
// Granular decorators, stage-3 call shape — all decorators optional.
// ---------------------------------------------------------------------------

test("stage-3: @intent/@returns + bare @trainable class compose and register", async () => {
	class Program {
		trainableMethod(name?: string): string {
			return name ? `Hello, ${name}!` : "Hello World!";
		}
	}
	const metadata: Record<PropertyKey, JsonValue> = {};
	const methodContext = decoratorContext<
		ClassMethodDecoratorContext<
			Program,
			(this: Program, input?: string) => string
		>
	>({
		kind: "method",
		name: "trainableMethod",
		metadata,
	});
	// Applied as decorators in app code; invoked programmatically here in
	// TC39 evaluation order (method decorators, then the class decorator).
	returns("Hello World! or Hello, <name>! when supplied")(
		Program.prototype.trainableMethod,
		methodContext,
	);
	intent("Produce a simple hello-world program")(
		Program.prototype.trainableMethod,
		methodContext,
	);
	trainable(
		Program,
		decoratorContext<ClassDecoratorContext>({
			kind: "class",
			name: "Program",
			metadata,
		}),
	);

	const record = getTrainable("Program.trainableMethod");
	assert.ok(record);
	assert.equal(record.fact.intent, "Produce a simple hello-world program");
	assert.equal(record.fact.contractRef, "decl://Program.trainableMethod");
	assert.equal(
		record.fact.output.returns?.description,
		"Hello World! or Hello, <name>! when supplied",
	);
	assert.deepEqual(record.fact.rubric, {}); // optional — none declared
	const run = resolveDeclared<string | undefined, string>(
		"Program.trainableMethod",
	);
	assert.equal(await run("Ada"), "Hello, Ada!");
});

test("stage-3: bare @trainable class with NO other decorators infers everything", async () => {
	class Greeter {
		greet(name?: string): string {
			return name ? `Hi ${name}` : "Hi";
		}
	}
	trainable(
		Greeter,
		decoratorContext<ClassDecoratorContext>({
			kind: "class",
			name: "Greeter",
			metadata: {},
		}),
	);

	const record = getTrainable("Greeter.greet");
	assert.ok(record);
	assert.match(record.fact.intent, /^Inferred: implement Greeter\.greet/);
	assert.equal(record.fact.contractRef, "decl://Greeter.greet");
	assert.equal(
		await resolveDeclared<string, string>("Greeter.greet")("Bo"),
		"Hi Bo",
	);
});

test("description() doubles as a FieldDescription value for stage-3 params maps", () => {
	const field = description("Optional person to greet");
	assert.equal(field.description, "Optional person to greet");
	training(async (name?: string) => name ?? "world", {
		methodRef: "hello",
		intent: "Say hello.",
		contract: { input: { name: "string?" }, output: { greeting: "string" } },
		params: { name: field },
	});
	assert.equal(
		getTrainable("hello")?.fact.params.name?.description,
		"Optional person to greet",
	);
});

// ---------------------------------------------------------------------------
// Ambient declarations: `export declare class` never runs decorators —
// scanDeclaredTrainables honors the exact syntax statically.
// ---------------------------------------------------------------------------

const AMBIENT = `
@trainable
export declare class Program {
  @intent("Produce a simple hello-world program")
  @returns("Hello World! or Hello, <name>! when supplied")
  trainableMethod(
    @description("Optional person to greet")
    name?: string,
  ): string;
}
`;

test("scanDeclaredTrainables parses the ambient @trainable declare class", () => {
	const [declared] = scanDeclaredTrainables(AMBIENT);
	assert.ok(declared);
	assert.equal(declared.className, "Program");
	assert.equal(declared.ambient, true);
	const [op] = declared.operations;
	assert.ok(op);
	assert.equal(op.methodRef, "Program.trainableMethod");
	assert.equal(op.intent, "Produce a simple hello-world program");
	assert.equal(op.inferredIntent, false);
	assert.equal(op.returns, "Hello World! or Hello, <name>! when supplied");
	assert.equal(op.contractRef, "decl://Program.trainableMethod");
	assert.equal(op.outputType, "string");
	assert.deepEqual(op.parameters, [
		{
			name: "name",
			optional: true,
			type: "string",
			description: "Optional person to greet",
		},
	]);
});

test("scan: every decorator optional — bare @trainable declare class still scans", () => {
	const [declared] = scanDeclaredTrainables(`
@trainable
export declare class Plain {
  greet(name?: string): string;
}
`);
	assert.ok(declared);
	const [op] = declared.operations;
	assert.ok(op);
	assert.equal(op.inferredIntent, true);
	assert.match(op.intent, /^Inferred: implement Plain\.greet/);
	assert.deepEqual(op.parameters, [
		{ name: "name", optional: true, type: "string" },
	]);
});

test("generateDeclaredRegistrations emits a grounded, runnable training.define", async () => {
	const [declared] = scanDeclaredTrainables(AMBIENT);
	assert.ok(declared);
	const generated = generateDeclaredRegistrations(declared);
	assert.match(generated, /Generated by hobo stub/);
	assert.match(generated, /training\.define\(/);
	assert.match(generated, /"methodRef": "Program\.trainableMethod"/);

	// The generated options object must actually register: evaluate it.
	const optionsJson = generated.slice(
		generated.indexOf("training.define(") + "training.define(".length,
		generated.lastIndexOf(");"),
	);
	const options = JSON.parse(optionsJson);
	const declaredFn = training.define(options);
	assert.equal(declaredFn.methodRef, "Program.trainableMethod");
	assert.equal(
		getTrainable("Program.trainableMethod")?.fact.contractRef,
		"decl://Program.trainableMethod",
	);
});
