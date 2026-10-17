/**
 * The Kubernetes provider's IaC-program check, its capability surface and its
 * yard spec rows. The event-store fold's payload handling is in
 * `yard-event-fold-payloads.test.ts`.
 *
 * The property that shapes this whole package is the **honest count of one
 * equivalence class**. Kubernetes natively provides compute — a Deployment
 * behind a Service — and nothing else. No database, no object store, no queue,
 * no cache. Those arrive through operators, which are third-party software
 * somebody installed into a cluster rather than something the Kubernetes API
 * offers. A row for one of them would make Matching answer `full` for a
 * capability that depends on software this provider cannot see, let alone
 * install; the deploy would then fail against a cluster that never had it.
 *
 * The Yard catalog is deliberately wider than that table, and that is not a
 * contradiction: a Job, a CronJob and a PersistentVolumeClaim are real
 * allocatable Kubernetes objects, they are simply not rows of the *cross-cloud*
 * equivalence table, which maps HoBo's ports onto a provider's headline
 * products. These tests pin both halves so neither gets "corrected" into the
 * other.
 *
 * The other property worth naming: **unresolved output references are caught at
 * emit time.** A program whose `${resources.x.outputs.y}` names a resource that
 * does not exist is one the engine fails to apply halfway through — after it has
 * created whatever came first. Rejecting it here makes that a refused program
 * rather than a partial deploy somebody has to reconcile by hand.
 */
import { describe, expect, it } from "vitest";

import { kubernetesYardSpec } from "../src/default-yard.js";
import { EQUIVALENCE_CLASSES } from "../src/equivalence.js";
import {
	assertLocalIacProgram,
	IAC_PROGRAM_API_VERSION,
	IAC_PROGRAM_KIND,
	IAC_PROVIDER,
	type IacProgram,
	KUBERNETES_IAC_PROVIDER,
} from "../src/iac-program.js";
import type { JsonValue } from "../src/json.js";
import {
	createKubernetesProvider,
	kubernetesDriverProgram,
} from "../src/provider.js";
import {
	isRealizablePort,
	mergeKubernetesOptions,
	realizeResourcePlan,
	realizeResourcePlans,
	resolveEquivalence,
} from "../src/realize.js";
import type { ResourcePlan } from "../src/types.js";

/** A program's fields as a document may carry them: the declared type, any other JSON, or absent. */
type ProgramFields = {
	readonly [field in keyof IacProgram]?:
		| IacProgram[field]
		| JsonValue
		| undefined;
};

function program(overrides: ProgramFields = {}): IacProgram {
	const document = {
		apiVersion: IAC_PROGRAM_API_VERSION,
		kind: IAC_PROGRAM_KIND,
		provider: IAC_PROVIDER,
		deploymentId: "d-1",
		stack: "kubernetes/d-1",
		resources: [
			{
				name: "api",
				type: "kubernetes:deployment",
				provider: KUBERNETES_IAC_PROVIDER,
				inputs: {},
				outputs: ["binding", "clusterIP"],
			},
		],
		stackOutputs: {},
		...overrides,
	};
	// SAFETY: the guard is the parse boundary for programs that crossed a
	// document boundary, so these tests hand it what the type forbids (a
	// foreign version, no resource list). It re-checks every field it relies on
	// before trusting the declared type.
	return document as IacProgram;
}

describe("assertLocalIacProgram", () => {
	it("returns a well-formed program unchanged", () => {
		const input = program();
		expect(assertLocalIacProgram(input)).toBe(input);
	});

	it("refuses a wrong schema version, kind, or IaC lane", () => {
		// The engine dispatches on all three. A program claiming a combination it
		// does not know is rejected there with a far less legible error.
		expect(() => assertLocalIacProgram(program({ apiVersion: "v2" }))).toThrow(
			/apiVersion must be/u,
		);
		expect(() => assertLocalIacProgram(program({ kind: "stack" }))).toThrow(
			/kind must be iac-program/u,
		);
		expect(() =>
			assertLocalIacProgram(program({ provider: "terraform" })),
		).toThrow(/provider must be pulumi/u);
	});

	it("refuses a program with no resources at all", () => {
		// An empty program applies cleanly and creates nothing — a deploy that
		// reports success and deploys nothing.
		expect(() => assertLocalIacProgram(program({ resources: [] }))).toThrow(
			/at least one resource/u,
		);
		expect(() =>
			assertLocalIacProgram(program({ resources: undefined })),
		).toThrow(/at least one resource/u);
	});

	it("refuses an unnamed resource", () => {
		// Names are how references resolve and how the engine addresses state
		// across applies. An unnamed resource cannot be updated on a second run.
		expect(() =>
			assertLocalIacProgram(
				program({
					resources: [
						{
							name: "",
							type: "kubernetes:deployment",
							provider: KUBERNETES_IAC_PROVIDER,
							inputs: {},
							outputs: [],
						},
					],
				}),
			),
		).toThrow(/missing name/u);
	});

	it("refuses two resources sharing a name", () => {
		// A duplicate makes every reference to that name ambiguous, and which one
		// the engine binds to is not something a plan author should reason about.
		const resource = {
			name: "api",
			type: "kubernetes:deployment",
			provider: KUBERNETES_IAC_PROVIDER,
			inputs: {},
			outputs: [],
		};
		expect(() =>
			assertLocalIacProgram(
				program({ resources: [resource, { ...resource }] }),
			),
		).toThrow(/duplicate resource api/u);
	});

	it("accepts a reference to a declared output", () => {
		expect(() =>
			assertLocalIacProgram(
				program({ stackOutputs: { ip: "${resources.api.outputs.clusterIP}" } }),
			),
		).not.toThrow();
	});

	it("refuses a reference to a resource or output that does not exist", () => {
		// Both fail at apply time, after earlier resources have been created.
		for (const value of [
			"${resources.ghost.outputs.clusterIP}",
			"${resources.api.outputs.nope}",
		]) {
			expect(() =>
				assertLocalIacProgram(program({ stackOutputs: { ip: value } })),
			).toThrow(/unresolved output reference/u);
		}
	});

	it("refuses a malformed reference rather than deploying it as a literal", () => {
		// Anything starting `${resources.` was meant to be a reference. Passing a
		// typo through would set an environment variable to the literal text.
		for (const value of [
			"${resources.api.outputs}",
			"${resources..outputs.x}",
			"${resources.api.outputs.x} trailing",
		]) {
			expect(() =>
				assertLocalIacProgram(program({ stackOutputs: { ip: value } })),
			).toThrow(/invalid output reference/u);
		}
	});

	it("leaves a value that is not trying to be a reference alone", () => {
		expect(() =>
			assertLocalIacProgram(
				program({ stackOutputs: { note: "costs $5 ${notaref}" } }),
			),
		).not.toThrow();
	});

	it("checks references nested anywhere inside a resource's inputs", () => {
		// Bind references live inside nested `bindings` arrays, so a top-level-only
		// walk would miss the common case entirely.
		expect(() =>
			assertLocalIacProgram(
				program({
					resources: [
						{
							name: "api",
							type: "kubernetes:deployment",
							provider: KUBERNETES_IAC_PROVIDER,
							inputs: {
								bindings: [{ ref: "${resources.ghost.outputs.binding}" }],
							},
							outputs: ["binding"],
						},
					],
				}),
			),
		).toThrow(/unresolved output reference/u);
	});
});

describe("the equivalence table's honest count", () => {
	it("claims exactly one class: compute", () => {
		// The whole point. Claiming a database or a queue would make Matching
		// answer `full` for a capability that needs an operator this provider
		// cannot see, and the deploy would fail against a cluster that never had
		// it installed.
		expect(Object.keys(EQUIVALENCE_CLASSES)).toEqual(["web/service"]);
		expect(EQUIVALENCE_CLASSES["web/service"].port).toBe("compute");
	});

	it("realizes compute and refuses every other port", () => {
		expect(isRealizablePort("compute")).toBe(true);
		for (const port of ["database", "kv", "queue", "blob", "cache"]) {
			expect(isRealizablePort(port)).toBe(false);
			expect(() => resolveEquivalence(port)).toThrow(
				new RegExp(`cannot realize port ${port}`, "u"),
			);
		}
	});

	it("offers a Yard catalog wider than the equivalence table, deliberately", () => {
		// A Job, a CronJob and a PersistentVolumeClaim are real allocatable
		// Kubernetes objects; they are just not rows of the *cross-cloud* table,
		// which maps ports onto headline products. Pinned so neither list gets
		// "corrected" into the other.
		expect(kubernetesYardSpec().bindings.length).toBeGreaterThan(
			Object.keys(EQUIVALENCE_CLASSES).length,
		);
	});
});

const PLAN = {
	name: "api",
	port: "compute",
	provider: "kubernetes",
} satisfies ResourcePlan;

describe("realize", () => {
	it("merges Kubernetes option blocks in declaration order", () => {
		// Later wins, so a caller can layer a specific override on a general
		// default rather than restating the whole block.
		expect(
			mergeKubernetesOptions([
				{ providerId: "kubernetes", options: { replicas: 1, ns: "default" } },
				{ providerId: "kubernetes", options: { replicas: 3 } },
			]),
		).toEqual({ replicas: 3, ns: "default" });
	});

	it("drops blocks belonging to another provider", () => {
		// A multi-provider plan carries all their blocks. Merging a foreign one
		// would put another provider's vocabulary into a Kubernetes manifest.
		expect(
			mergeKubernetesOptions([
				{ providerId: "aws", options: { instanceType: "t3.micro" } },
				{ providerId: "kubernetes", options: { replicas: 2 } },
			]),
		).toEqual({ replicas: 2 });
	});

	it("merges an absent option list to an empty object", () => {
		expect(mergeKubernetesOptions()).toEqual({});
		expect(mergeKubernetesOptions([])).toEqual({});
	});

	it("realizes a plan into a program that passes its own check", () => {
		const { iac } = realizeResourcePlan(PLAN);
		expect(() => assertLocalIacProgram(iac)).not.toThrow();
		expect(iac.resources[0]?.type).toBe("kubernetes:deployment");
	});

	it("omits the region when the plan states none", () => {
		// Absent rather than undefined: a null region in a manifest is a different
		// thing to an omitted one.
		expect(
			Object.hasOwn(
				realizeResourcePlan(PLAN).iac.resources[0]?.inputs ?? {},
				"region",
			),
		).toBe(false);
	});

	it("emits no build spec for a plan that builds nothing", () => {
		expect(realizeResourcePlan(PLAN).build).toBeUndefined();
	});

	it("emits a build spec naming the artifact when the plan builds one", () => {
		const { build } = realizeResourcePlan({
			...PLAN,
			build: { artifactId: "a-1", source: "./src", target: "wasm32-wasi" },
		});
		expect(build?.artifacts[0]?.id).toBe("a-1");
	});

	it("realizes several plans into one program whose bind references resolve", () => {
		// A dependency edge becomes an output reference, and it has to resolve
		// against a resource in the *same* program.
		const { iac } = realizeResourcePlans([
			{ ...PLAN, name: "web" },
			{ ...PLAN, name: "api", deps: ["web"] },
		]);
		expect(iac.resources).toHaveLength(2);
		expect(() => assertLocalIacProgram(iac)).not.toThrow();
	});

	it("refuses an empty deployment plan", () => {
		expect(() => realizeResourcePlans([])).toThrow(/cannot realize an empty/u);
	});

	it("derives the stack name from the deployment id", () => {
		// The stack is the engine's state key; deriving it keeps one deployment's
		// state from overwriting another's.
		const { iac } = realizeResourcePlans([PLAN], { deploymentId: "d-9" });
		expect(iac.stack).toBe("kubernetes/d-9");
	});
});

describe("provider surface", () => {
	const provider = createKubernetesProvider();

	it("declares one capability, matching the equivalence table", () => {
		expect(provider.capabilities).toHaveLength(1);
		expect(provider.capabilities[0]?.port).toBe("compute");
	});

	it("matches fully when the requested features are all offered", () => {
		expect(
			provider.capabilities[0]?.satisfies({
				port: "compute",
				features: ["container", "http"],
			}),
		).toEqual({ kind: "full" });
	});

	it("matches fully when no features are requested", () => {
		// The `?? []` path — the common case, and it must not read as a request
		// for an unknown feature.
		expect(provider.capabilities[0]?.satisfies({ port: "compute" })).toEqual({
			kind: "full",
		});
	});

	it("reports a partial match naming exactly what is missing", () => {
		// The missing list is what placement uses to decide between substituting
		// and failing. Reporting `none` would hide a near-miss a human could have
		// resolved by dropping one feature.
		expect(
			provider.capabilities[0]?.satisfies({
				port: "compute",
				features: ["http", "gpu"],
			}),
		).toEqual({ kind: "partial", missing: ["gpu"] });
	});

	it("reports no match for a port it does not serve", () => {
		expect(provider.capabilities[0]?.satisfies({ port: "database" })).toEqual({
			kind: "none",
		});
	});

	it("parses each published manifest document into its own field", () => {
		// Two readers of one manifest must not be able to reach different
		// conclusions about what this provider offers or what it costs.
		const manifest = provider.capabilityManifest();
		for (const [document, parsed] of [
			["capabilities.json", manifest.capabilities],
			["auth.json", manifest.auth],
			["cost.json", manifest.cost],
		] as const) {
			expect(parsed).toEqual(
				JSON.parse(
					String(
						manifest.published[`/.well-known/capability-manifest/${document}`],
					),
				),
			);
		}
	});

	it("builds a client for the compute port carrying its outputs", () => {
		const client = provider.client("compute", { clusterIP: "10.0.0.1" });
		expect(client.resourceClass).toBe("kubernetes:deployment");
		expect(client.providerService).toBe("Kubernetes Deployment");
		expect(client.bindings).toEqual({ clusterIP: "10.0.0.1" });
	});

	it("refuses a client for a port it has none for, naming the port", () => {
		// Named because a placement that reached here picked the wrong provider,
		// and the reader needs to know which port did it.
		expect(() => provider.client("database", {})).toThrow(
			/no client for port database/u,
		);
	});

	it("emits a driver program naming the mapped resource class", () => {
		const driver = kubernetesDriverProgram(PLAN);
		expect(driver.apiVersion).toBe("hobo.driver-program/v1");
		expect(driver.driver).toBe("kubernetes-deploy");
		expect(driver.resources[0]?.type).toBe("kubernetes:deployment");
	});

	it("refuses to emit a driver program for an unrealizable port", () => {
		// A driver program built from a bad plan would fail inside whatever
		// executed it, far from the plan that caused it.
		expect(() =>
			kubernetesDriverProgram({ ...PLAN, name: "db", port: "database" }),
		).toThrow(/cannot realize port database/u);
	});
});

describe("yard spec rows", () => {
	it("names kubernetes as the provider and carries regions", () => {
		expect(kubernetesYardSpec().provider).toBe("kubernetes");
		expect(kubernetesYardSpec().regions.length).toBeGreaterThan(0);
	});

	it("honours a region override and copies the caller's array", () => {
		// The spec is frozen and long-lived; holding the caller's array would let
		// a later push change what an already-returned spec reports.
		const regions = ["eu-west"];
		const spec = kubernetesYardSpec({ regions });
		regions.push("us-east");
		expect(spec.regions).toEqual(["eu-west"]);
	});

	it("sorts rows by profile, then product, then connectivity", () => {
		// `@hobo/yards` imposes this order, so a round-trip through it must not
		// reshuffle the set — otherwise a generated spec diffs against itself.
		const rows = kubernetesYardSpec().bindings;
		const key = (row: (typeof rows)[number]) =>
			`${row.profile} ${row.productId ?? ""} ${row.connectivityId ?? ""}`;
		expect(rows.map(key)).toEqual(rows.map(key).sort());
	});

	it("freezes the spec and every row", () => {
		const spec = kubernetesYardSpec();
		expect(Object.isFrozen(spec)).toBe(true);
		for (const row of spec.bindings) expect(Object.isFrozen(row)).toBe(true);
	});

	it("is stable across calls", () => {
		expect(JSON.stringify(kubernetesYardSpec())).toBe(
			JSON.stringify(kubernetesYardSpec()),
		);
	});
});
