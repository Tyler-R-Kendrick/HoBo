// E20: typed realization output contract (hobo.realization-result/v1) —
// parse-don't-validate happy/malformed lanes, the fail-closed ref-only
// secret rule, and the fromIacOutputs / fromRecipeOutputs adapters.
import assert from "node:assert/strict";
import { test } from "vitest";

import {
	fromIacOutputs,
	fromRecipeOutputs,
	isSecretRefString,
	looksLikeSecretKey,
	parseRealizationResult,
	REALIZATION_RESULT_SCHEMA,
	RealizationResultParseError,
} from "../src/ports/realization-result.js";

const HAPPY = {
	schema: REALIZATION_RESULT_SCHEMA,
	resources: [
		{
			name: "queue",
			resourceClass: "queue",
			providerId: "terraform://workspace/queue",
			outputs: { url: "https://queue.example.test" },
		},
		{
			name: "db",
			resourceClass: "kv",
			providerId: "pulumi:stack:db",
			outputs: { host: "db.example.test", port: 5432 },
		},
	],
	values: { region: "eu-west-1", replicas: 3 },
	bindings: [
		{ key: "queue.url", value: "https://queue.example.test" },
		{ key: "db.host", value: "db.example.test" },
	],
	secrets: { dbPassword: { secretRef: "broker://tenant/db-password" } },
};

test("happy parse: canonical ordering, frozen result, schema pinned", () => {
	const parsed = parseRealizationResult(HAPPY);
	assert.equal(parsed.schema, REALIZATION_RESULT_SCHEMA);
	assert.deepEqual(
		parsed.resources.map((resource) => resource.name),
		["db", "queue"],
	);
	assert.deepEqual(
		parsed.bindings.map((binding) => binding.key),
		["db.host", "queue.url"],
	);
	assert.deepEqual(parsed.secrets, {
		dbPassword: { secretRef: "broker://tenant/db-password" },
	});
	assert.ok(Object.isFrozen(parsed));
	assert.ok(Object.isFrozen(parsed.resources));
	assert.ok(Object.isFrozen(parsed.resources[0]));
});

test("parse is deterministic: JSON round-trip is byte-stable", () => {
	const parsed = parseRealizationResult(HAPPY);
	const reparsed = parseRealizationResult(JSON.parse(JSON.stringify(parsed)));
	assert.equal(JSON.stringify(parsed), JSON.stringify(reparsed));
});

test("malformed inputs are typed rejections", () => {
	for (const [raw, rejection] of [
		[null, "not-an-object"],
		[[], "not-an-object"],
		[{ schema: "hobo.realization-result/v2" }, "schema-mismatch"],
		[{}, "schema-mismatch"],
		[
			{ schema: REALIZATION_RESULT_SCHEMA, resources: [{}] },
			"invalid-resource",
		],
		[
			{
				schema: REALIZATION_RESULT_SCHEMA,
				resources: [
					{ name: "a", resourceClass: "kv", providerId: "x" },
					{ name: "a", resourceClass: "kv", providerId: "y" },
				],
			},
			"duplicate-resource",
		],
		[
			{ schema: REALIZATION_RESULT_SCHEMA, bindings: [{ value: 1 }] },
			"invalid-binding",
		],
		[
			{
				schema: REALIZATION_RESULT_SCHEMA,
				bindings: [
					{ key: "a", value: 1 },
					{ key: "a", value: 2 },
				],
			},
			"duplicate-binding",
		],
		[
			{ schema: REALIZATION_RESULT_SCHEMA, values: "nope" },
			"invalid-value-map",
		],
	] as const) {
		assert.throws(
			() => parseRealizationResult(raw),
			(error: unknown) =>
				error instanceof RealizationResultParseError &&
				error.rejection === rejection,
			`expected ${rejection}`,
		);
	}
});

test("ref-only rule: raw secret-looking values are rejected everywhere", () => {
	const leaks = [
		{ values: { db_password: "hunter2" } },
		{ values: { apiKey: "sk-123" } },
		{
			resources: [
				{
					name: "db",
					resourceClass: "kv",
					providerId: "x",
					outputs: { connection_token: "raw-token" },
				},
			],
		},
		{
			bindings: [{ key: "${resources.db.outputs.password}", value: "hunter2" }],
		},
	];
	for (const leak of leaks) {
		assert.throws(
			() =>
				parseRealizationResult({ schema: REALIZATION_RESULT_SCHEMA, ...leak }),
			(error: unknown) =>
				error instanceof RealizationResultParseError &&
				error.rejection === "raw-secret-value" &&
				!String(error.message).includes("hunter2") &&
				!String(error.message).includes("sk-123") &&
				!String(error.message).includes("raw-token"),
		);
	}
});

test("ref-only rule: ref strings under secret-looking keys are allowed", () => {
	const parsed = parseRealizationResult({
		schema: REALIZATION_RESULT_SCHEMA,
		values: { db_password: "broker://tenant/db-password" },
		resources: [],
	});
	assert.equal(parsed.values.db_password, "broker://tenant/db-password");
});

test("secrets map accepts refs only, redacting anything else", () => {
	assert.throws(
		() =>
			parseRealizationResult({
				schema: REALIZATION_RESULT_SCHEMA,
				secrets: { dbPassword: "hunter2" },
			}),
		(error: unknown) =>
			error instanceof RealizationResultParseError &&
			error.rejection === "invalid-secret-ref" &&
			error.received === "<redacted>" &&
			!String(error.message).includes("hunter2"),
	);
	const parsed = parseRealizationResult({
		schema: REALIZATION_RESULT_SCHEMA,
		secrets: { a: "broker://tenant/a", b: { secretRef: "vault://kv/b" } },
	});
	assert.deepEqual(parsed.secrets, {
		a: { secretRef: "broker://tenant/a" },
		b: { secretRef: "vault://kv/b" },
	});
});

test("secret heuristics: key and ref detection boundaries", () => {
	assert.ok(looksLikeSecretKey("db_password"));
	assert.ok(looksLikeSecretKey("apiKey"));
	assert.ok(looksLikeSecretKey("stack.access_key"));
	assert.ok(!looksLikeSecretKey("monkey"));
	assert.ok(!looksLikeSecretKey("connectionHost"));
	assert.ok(isSecretRefString("broker://tenant/db"));
	assert.ok(isSecretRefString("vault://kv/path#field"));
	assert.ok(!isSecretRefString("hunter2"));
	assert.ok(!isSecretRefString("broker://"));
});

// The `{resources, stackOutputs, bindings}` triple shape the terraform /
// pulumi / crossplane adapters emit today (terraform-adapter.ts).
const IAC_TRIPLE = {
	resources: {
		queue: {
			id: "terraform://workspace/app.queue",
			type: "queue",
			outputs: { url: "https://queue.example.test" },
		},
		bucket: {
			id: "pulumi:stack:bucket",
			outputs: { arn: "arn:aws:s3:::bucket" },
		},
	},
	stackOutputs: { region: "eu-west-1" },
	bindings: {
		"queue.url": "https://queue.example.test",
		"${resources.queue.outputs.url}": "https://queue.example.test",
		"stack.region": "eu-west-1",
	},
};

test("fromIacOutputs maps the IaC triple onto the contract", () => {
	const parsed = fromIacOutputs(IAC_TRIPLE);
	assert.deepEqual(
		parsed.resources.map((resource) => ({
			name: resource.name,
			resourceClass: resource.resourceClass,
			providerId: resource.providerId,
		})),
		[
			{
				name: "bucket",
				resourceClass: "iac-resource",
				providerId: "pulumi:stack:bucket",
			},
			{
				name: "queue",
				resourceClass: "queue",
				providerId: "terraform://workspace/app.queue",
			},
		],
	);
	assert.deepEqual(parsed.values, { region: "eu-west-1" });
	assert.deepEqual(
		parsed.bindings.map((binding) => binding.key),
		["${resources.queue.outputs.url}", "queue.url", "stack.region"],
	);
	assert.deepEqual(parsed.secrets, {});
});

test("fromIacOutputs hoists ref-valued secret bindings and rejects raw ones", () => {
	const hoisted = fromIacOutputs({
		...IAC_TRIPLE,
		bindings: {
			...IAC_TRIPLE.bindings,
			"db.password": "broker://tenant/db-password",
		},
		stackOutputs: { apiToken: "broker://tenant/api-token" },
	});
	assert.deepEqual(hoisted.secrets, {
		apiToken: { secretRef: "broker://tenant/api-token" },
		"db.password": { secretRef: "broker://tenant/db-password" },
	});
	assert.ok(!("apiToken" in hoisted.values));

	assert.throws(
		() =>
			fromIacOutputs({
				...IAC_TRIPLE,
				bindings: { ...IAC_TRIPLE.bindings, "db.password": "hunter2" },
			}),
		(error: unknown) =>
			error instanceof RealizationResultParseError &&
			error.rejection === "raw-secret-value",
	);
});

test("fromRecipeOutputs maps a driver-program result onto the contract", () => {
	const parsed = fromRecipeOutputs(
		{
			values: { deployment: "team-app" },
			secrets: {
				deployKey: "broker://tenant/convex-deploy-key",
				adminToken: { secretRef: "vault://kv/admin" },
			},
			resources: [
				{
					name: "functions",
					type: "convex.function",
					id: "convex://team-app/functions",
					outputs: { endpoint: "https://team-app.convex.test" },
				},
				{ name: "auth", resourceClass: "convex.auth" },
			],
		},
		{ defaultResourceClass: "convex-resource" },
	);
	assert.deepEqual(
		parsed.resources.map((resource) => ({
			name: resource.name,
			resourceClass: resource.resourceClass,
			providerId: resource.providerId,
		})),
		[
			{ name: "auth", resourceClass: "convex.auth", providerId: "auth" },
			{
				name: "functions",
				resourceClass: "convex.function",
				providerId: "convex://team-app/functions",
			},
		],
	);
	assert.deepEqual(parsed.secrets, {
		adminToken: { secretRef: "vault://kv/admin" },
		deployKey: { secretRef: "broker://tenant/convex-deploy-key" },
	});
});

test("fromRecipeOutputs rejects raw secret values fail-closed", () => {
	assert.throws(
		() =>
			fromRecipeOutputs({
				secrets: { deployKey: "raw-key-value" },
				resources: [{ name: "functions" }],
			}),
		(error: unknown) =>
			error instanceof RealizationResultParseError &&
			error.rejection === "invalid-secret-ref",
	);
	assert.throws(
		() =>
			fromRecipeOutputs({
				values: { accessToken: "raw-token" },
				resources: [{ name: "functions" }],
			}),
		(error: unknown) =>
			error instanceof RealizationResultParseError &&
			error.rejection === "raw-secret-value",
	);
});
