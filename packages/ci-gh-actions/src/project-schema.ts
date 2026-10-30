import { parseBudgetPolicyJson } from "@hobo/core";
import { z } from "zod";

const name = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
export const CiSecretRequirementSchema = z
	.object({
		requiredFor: z
			.array(z.enum(["deployment", "execution"]))
			.min(1)
			.max(2)
			.refine((phases) => new Set(phases).size === phases.length)
			.meta({ uniqueItems: true }),
	})
	.strict();
const secrets = z
	.record(z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/), CiSecretRequirementSchema)
	.refine((entries) => Object.keys(entries).length <= 64)
	.meta({ id: "SecretRequirements", maxProperties: 64 });
const pool = z
	.object({
		label: z.literal("hobo"),
		os: z.literal("linux"),
		architecture: z.literal("x64"),
	})
	.strict()
	.meta({ id: "Pool" });
const routing = z
	.object({
		strategy: z.enum([
			"lowest-total-incremental-cost",
			"min-cost",
			"maximize-credits",
		]),
		noEligibleProvider: z.literal("queue"),
		unknownAllocation: z.literal("zero"),
	})
	.strict()
	.meta({ id: "Routing" });
const budget = z
	.object({
		scope: z.literal("ci-account"),
		currency: z.literal("USD"),
		limitMicros: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
		period: z.literal("manual"),
		timeZone: z.literal("UTC"),
	})
	.strict()
	.meta({ id: "Budget" });
const safeQuantity = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
// Both Unicode-aware and flagless JSON Schema engines must accept astral characters and exclude C0/C1.
const controlFree = /^(?:[\u0020-\u007e\u00a0-\uffff]|[^\0-\uffff])*$/u;
const scopeName = z.string().min(1).max(200).regex(controlFree);
const commonBudget = z
	.object({
		schemaVersion: z.literal("hobo.budget-policy/v1"),
		tenantId: scopeName,
		budgetId: scopeName,
		periodId: scopeName,
		revision: scopeName,
		workloads: z
			.array(z.string().regex(/^[a-z][a-z0-9_.-]{0,79}$/u))
			.min(1)
			.max(32)
			.meta({ uniqueItems: true }),
		currency: z.literal("USD"),
		limitMicros: safeQuantity,
		objective: z.enum(["min-cost", "maximize-credits"]),
		enforcement: z.enum(["strict", "conservative"]),
		periodKind: z.enum(["manual", "fixed-window"]),
		periodStartsAtMs: safeQuantity.optional(),
		periodEndsAtMs: safeQuantity.optional(),
		constraints: z
			.array(
				z
					.object({
						key: z.string().regex(/^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/u),
						workload: z.string().regex(/^(?:\*|[a-z][a-z0-9_.-]{0,79})$/u),
						unit: z.string().regex(/^[A-Za-z][A-Za-z0-9_.:/-]{0,79}$/u),
						maximum: safeQuantity,
						target: z.string().max(200).regex(controlFree).optional(),
					})
					.strict(),
			)
			.max(128)
			.optional(),
	})
	.strict()
	.superRefine((value, context) => {
		try {
			parseBudgetPolicyJson(JSON.stringify(value));
		} catch {
			context.addIssue({
				code: "custom",
				message: "invalid common budget policy",
			});
		}
	})
	.meta({ id: "CommonBudgetPolicy" });
const provider = z
	.object({
		id,
		kind: z.enum([
			"github",
			"blacksmith",
			"depot",
			"warpbuild",
			"kubernetes",
			"local",
			"vercel",
			"dagger",
			"cloudflare",
		]),
		connectionRef: z.string().regex(/^[A-Za-z0-9_.:/-]{1,200}$/),
		runsOn: z.string().regex(/^(?![Hh][Oo][Bb][Oo]$)[A-Za-z0-9_.-]{1,100}$/),
		enabled: z.boolean().optional(),
	})
	.strict()
	.meta({ id: "Provider" });
const threshold = z
	.object({ fraction: z.number().gt(0).max(1), allow: z.array(id) })
	.strict();
const reference = (category: string) =>
	z
		.object({
			$ref: z
				.string()
				.regex(
					new RegExp(`^#/definitions/${category}/[A-Za-z][A-Za-z0-9_-]{0,63}$`),
				),
		})
		.strict();
const policy = z
	.object({
		accountId: id,
		tenantId: id,
		pool: z.union([pool, reference("pools")]),
		routing: z.union([routing, reference("routing")]),
		budget: z.union([budget, reference("budgets")]),
		budgetPolicy: commonBudget.optional(),
		providers: z
			.array(z.union([provider, reference("providers")]))
			.min(1)
			.max(100),
		thresholds: z.array(threshold).max(100).optional(),
	})
	.strict()
	.meta({ id: "Policy" });
// Legacy templates permit partial object fragments, but keep every field typed.
const partialPolicy = policy
	.extend({
		pool: z.union([pool.partial(), reference("pools")]).optional(),
		routing: z.union([routing.partial(), reference("routing")]).optional(),
		budget: z.union([budget.partial(), reference("budgets")]).optional(),
	})
	.partial();
const fields = z
	.object({
		relayOrigin: z.string().min(1).max(2048),
		githubWebhookOrigin: z.string().min(1).max(2048).optional(),
		allowInsecureLoopback: z.boolean().optional(),
		secrets: z.union([secrets, reference("secrets")]).optional(),
		policy,
	})
	.strict();
const template = fields
	.extend({ policy: partialPolicy.optional() })
	.partial()
	.strict();
const registry = <T extends z.ZodType>(value: T) =>
	z
		.record(name, value)
		.refine((entries) => Object.keys(entries).length <= 32)
		.meta({ maxProperties: 32 });
const definitions = z
	.object({
		pools: registry(pool).optional(),
		routing: registry(routing).optional(),
		budgets: registry(budget).optional(),
		providers: registry(provider).optional(),
		secrets: registry(secrets).optional(),
	})
	.strict()
	.meta({ id: "Definitions" });
export const CiProjectDocumentSchema = z
	.object({
		$schema: z.string().max(2048).optional(),
		defaultEnvironment: name.optional(),
		definitions: definitions.optional(),
		templates: z
			.record(name, template)
			.refine((entries) => Object.keys(entries).length <= 32)
			.meta({ maxProperties: 32 })
			.optional(),
		environments: z
			.record(
				name,
				z.union([fields, template.extend({ extends: name }).strict()]),
			)
			.refine((entries) => Object.keys(entries).length <= 32)
			.meta({ maxProperties: 32 })
			.optional(),
	})
	.strict();

/** The shipped editor schema and runtime parser share this authoring contract. */
export function ciProjectJsonSchema() {
	return {
		...z.toJSONSchema(CiProjectDocumentSchema, {
			target: "draft-2020-12",
			reused: "ref",
		}),
		$id: "https://raw.githubusercontent.com/Tyler-R-Kendrick/HoBo/main/packages/ci-gh-actions/schema/ci-project.schema.json",
		title: "HoBo CI project configuration",
	};
}

type JsonData = z.infer<ReturnType<typeof z.json>>;
const object = z.record(z.string(), z.json());
const referencePattern =
	/^#\/definitions\/(pools|routing|budgets|providers|secrets)\/([A-Za-z][A-Za-z0-9_-]{0,63})$/;

/** Resolve only validated, concrete, local component definitions. Never performs I/O. */
export function resolveCiProjectReferences(
	input: z.infer<typeof CiProjectDocumentSchema>,
): JsonData {
	const definitionsValue = object.parse(input.definitions ?? {});
	function expand(value: JsonData, depth: number): JsonData {
		if (depth > 32) throw new Error("configuration nesting too deep");
		if (Array.isArray(value))
			return value.map((entry) => expand(entry, depth + 1));
		const record = object.safeParse(value);
		if (!record.success) return value;
		if (Object.hasOwn(record.data, "$ref")) {
			const ref = z.string().parse(record.data.$ref);
			const match = referencePattern.exec(ref);
			const category = match?.[1],
				key = match?.[2];
			if (!category || !key) throw new Error("invalid component reference");
			const registry = object.parse(definitionsValue[category] ?? {});
			if (!Object.hasOwn(registry, key))
				throw new Error("missing component reference");
			const found = registry[key];
			if (found === undefined) throw new Error("missing component definition");
			return found;
		}
		return Object.fromEntries(
			Object.entries(record.data).map(([key, entry]) => [
				key,
				expand(entry, depth + 1),
			]),
		);
	}
	const { definitions: _definitions, $schema: _schema, ...document } = input;
	return expand(z.json().parse(document), 0);
}
