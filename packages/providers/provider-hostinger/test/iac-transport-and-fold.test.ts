/**
 * The Hostinger provider's IaC-program check, its transport allowlist, its yard
 * spec rows, and the event-store fold.
 *
 * Four surfaces, three of them holding a property that would fail silently
 * rather than loudly if it broke.
 *
 * **The transport allowlist is a spending control.** `/api/billing/v1/` is
 * deliberately absent from it. The hosting namespace can fill a plan the account
 * already bought — `POST /api/hosting/v1/websites` takes an `order_id` and
 * refuses without one — but nothing this package can reach places an order. That
 * is why the list names namespaces rather than a host: a guard keyed only on
 * `developers.hostinger.com` would let a "just provision it" resolver spend the
 * account's money with no human in the loop.
 *
 * **Unresolved output references must be caught at emit time.** An IaC program
 * whose `${resources.x.outputs.y}` names a resource that does not exist, or an
 * output that resource never declares, is a program the engine will fail to
 * apply halfway through — after it has already created whatever came first. The
 * check here is what makes that a rejected program instead of a partial deploy.
 *
 * **Yard binding rows are sorted for reproducibility.** `@hobo/yards` imposes
 * `(profile, productId, connectivityId)` ordering, and the sort is
 * locale-independent by code unit. A locale-sensitive comparison would make the
 * same catalog produce different row orders on different machines, and a diff of
 * a generated yard spec would show churn nobody wrote.
 */
import { describe, expect, it } from "vitest";

import { hostingerYardSpec } from "../src/default-yard.js";
import {
	assertLocalIacProgram,
	HOSTINGER_IAC_PROVIDER,
	IAC_PROGRAM_API_VERSION,
	IAC_PROGRAM_KIND,
	IAC_PROVIDER,
	type IacProgram,
} from "../src/iac-program.js";
import {
	isRealizablePort,
	mergeHostingerOptions,
	realizeResourcePlan,
	realizeResourcePlans,
	resolveEquivalence,
} from "../src/realize.js";
import {
	HOSTINGER_ALLOWED_PATH_PREFIXES,
	HOSTINGER_API_HOST,
	HOSTINGER_EXCLUDED_PATH_PREFIXES,
	HOSTINGER_MAX_RESPONSE_BYTES,
	HOSTINGER_MAX_TIMEOUT_MS,
	HostingerTransportConfigError,
	hostingerApiUrl,
	hostingerTransportPolicy,
} from "../src/transport.js";
import {
	HOSTINGER_EVENT_STORE_RESOLVER_ID,
	hostingerEventStoreFoldDescriptor,
	normalizeHostingerYardSignal,
} from "../src/yard-event-fold.js";

/** A minimal program that passes every structural check. */
function program(overrides: Partial<IacProgram> = {}): IacProgram {
	return {
		apiVersion: IAC_PROGRAM_API_VERSION,
		kind: IAC_PROGRAM_KIND,
		provider: IAC_PROVIDER,
		deploymentId: "d-1",
		stack: "hostinger/d-1",
		resources: [
			{
				name: "api",
				type: "hostinger:vps",
				provider: HOSTINGER_IAC_PROVIDER,
				inputs: {},
				outputs: ["ipv4", "binding"],
			},
		],
		stackOutputs: {},
		...overrides,
	} as IacProgram;
}

describe("assertLocalIacProgram", () => {
	it("returns a well-formed program unchanged", () => {
		const input = program();
		expect(assertLocalIacProgram(input)).toBe(input);
	});

	it("refuses a program stamped with the wrong schema version", () => {
		// The engine dispatches on this. A program claiming a version the engine
		// does not know is rejected there with a far less legible error than the
		// one that names the expected value.
		expect(() =>
			assertLocalIacProgram(
				program({ apiVersion: "hobo.iac-program/v2" } as never),
			),
		).toThrow(/apiVersion must be/u);
	});

	it("refuses a program with the wrong kind or IaC lane", () => {
		expect(() =>
			assertLocalIacProgram(program({ kind: "stack" } as never)),
		).toThrow(/kind must be iac-program/u);
		expect(() =>
			assertLocalIacProgram(program({ provider: "terraform" } as never)),
		).toThrow(/provider must be pulumi/u);
	});

	it("refuses a program with no resources at all", () => {
		// An empty program applies cleanly and creates nothing, which reads to a
		// caller as a successful deploy of an empty deployment. Better refused
		// here than reported as a no-op success.
		expect(() => assertLocalIacProgram(program({ resources: [] }))).toThrow(
			/at least one resource/u,
		);
		expect(() =>
			assertLocalIacProgram(program({ resources: undefined } as never)),
		).toThrow(/at least one resource/u);
	});

	it("refuses a resource with no name", () => {
		// Names are how references resolve and how the engine addresses state. An
		// unnamed resource cannot be referenced or updated on a second apply.
		expect(() =>
			assertLocalIacProgram(
				program({
					resources: [
						{
							name: "",
							type: "hostinger:vps",
							provider: HOSTINGER_IAC_PROVIDER,
							inputs: {},
							outputs: [],
						},
					],
				}),
			),
		).toThrow(/missing name/u);
	});

	it("refuses two resources sharing a name", () => {
		// A duplicate makes every reference to that name ambiguous, and the engine
		// would silently bind to one of them. Which one is not something a plan
		// author should have to reason about.
		expect(() =>
			assertLocalIacProgram(
				program({
					resources: [
						{
							name: "api",
							type: "hostinger:vps",
							provider: HOSTINGER_IAC_PROVIDER,
							inputs: {},
							outputs: [],
						},
						{
							name: "api",
							type: "hostinger:mysql-database",
							provider: HOSTINGER_IAC_PROVIDER,
							inputs: {},
							outputs: [],
						},
					],
				}),
			),
		).toThrow(/duplicate resource api/u);
	});

	it("accepts a reference to a declared output", () => {
		expect(() =>
			assertLocalIacProgram(
				program({ stackOutputs: { url: "${resources.api.outputs.ipv4}" } }),
			),
		).not.toThrow();
	});

	it("refuses a reference to a resource that does not exist", () => {
		// The consequential check. The engine would fail applying this *after*
		// creating whatever came first, leaving a half-built deployment that has
		// to be reconciled by hand.
		expect(() =>
			assertLocalIacProgram(
				program({ stackOutputs: { url: "${resources.ghost.outputs.ipv4}" } }),
			),
		).toThrow(/unresolved output reference resources\.ghost\.outputs\.ipv4/u);
	});

	it("refuses a reference to an output the resource never declares", () => {
		// Same failure mode, one level deeper: the resource exists, the output
		// does not, and the reference resolves to nothing at apply time.
		expect(() =>
			assertLocalIacProgram(
				program({ stackOutputs: { url: "${resources.api.outputs.nope}" } }),
			),
		).toThrow(/unresolved output reference/u);
	});

	it("refuses a malformed reference rather than treating it as a literal", () => {
		// Anything starting `${resources.` was *meant* to be a reference. Passing
		// a typo through as a plain string would deploy the literal text
		// `${resources.api.outputs}` as a value.
		for (const value of [
			"${resources.api.outputs}",
			"${resources..outputs.x}",
			"${resources.api.output.x}",
			"${resources.api.outputs.x} trailing",
		]) {
			expect(() =>
				assertLocalIacProgram(program({ stackOutputs: { url: value } })),
			).toThrow(/invalid output reference/u);
		}
	});

	it("leaves a string that is not trying to be a reference alone", () => {
		// The `startsWith` early return. Ordinary values — hostnames, regions,
		// even a `$` in a password — must not be parsed as references.
		expect(() =>
			assertLocalIacProgram(
				program({ stackOutputs: { note: "cost is $5 ${notaref}" } }),
			),
		).not.toThrow();
	});

	it("checks references nested anywhere inside a resource's inputs", () => {
		// `collectValues` walks the whole input tree. Checking only the top level
		// would miss the common case, since bind references live inside nested
		// `bindings` arrays.
		expect(() =>
			assertLocalIacProgram(
				program({
					resources: [
						{
							name: "api",
							type: "hostinger:vps",
							provider: HOSTINGER_IAC_PROVIDER,
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

describe("realize", () => {
	const PLAN = { name: "api", port: "compute" } as never;

	it("recognises the ports this provider realizes", () => {
		expect(isRealizablePort("compute")).toBe(true);
		expect(isRealizablePort("database")).toBe(true);
		expect(isRealizablePort("blob")).toBe(false);
	});

	it("refuses to resolve an equivalence for a port it cannot realize", () => {
		// Named in the message, because a placement that reached here picked the
		// wrong provider and the reader needs to know which port did it.
		expect(() => resolveEquivalence("blob")).toThrow(
			/cannot realize port blob/u,
		);
	});

	it("merges Hostinger option blocks in declaration order", () => {
		// Later blocks win, so a caller can layer a specific override on a general
		// default rather than having to restate the whole block.
		expect(
			mergeHostingerOptions([
				{ providerId: "hostinger", options: { plan: "kvm2", region: "phx" } },
				{ providerId: "hostinger", options: { plan: "kvm4" } },
			] as never),
		).toEqual({ plan: "kvm4", region: "phx" });
	});

	it("drops option blocks belonging to another provider", () => {
		// A plan authored for several providers carries all their blocks. Merging
		// a foreign one would put another provider's vocabulary into a Hostinger
		// resource's inputs, where it would be sent to Hostinger's API verbatim.
		expect(
			mergeHostingerOptions([
				{ providerId: "aws", options: { instanceType: "t3.micro" } },
				{ providerId: "hostinger", options: { plan: "kvm2" } },
			] as never),
		).toEqual({ plan: "kvm2" });
	});

	it("merges an absent option list to an empty object", () => {
		// The default parameter. Returning undefined would make every consumer
		// guard, and one of them would forget.
		expect(mergeHostingerOptions()).toEqual({});
		expect(mergeHostingerOptions([])).toEqual({});
	});

	it("realizes a single plan into a valid program", () => {
		const { iac } = realizeResourcePlan(PLAN);
		expect(() => assertLocalIacProgram(iac)).not.toThrow();
		expect(iac.resources[0]?.provider).toBe(HOSTINGER_IAC_PROVIDER);
	});

	it("omits the region from inputs when the plan states none", () => {
		// Absent rather than `undefined`. A null region in a request body is a
		// different thing to Hostinger's API than an omitted one.
		const { iac } = realizeResourcePlan(PLAN);
		expect(Object.hasOwn(iac.resources[0]?.inputs ?? {}, "region")).toBe(false);
	});

	it("carries a stated region through", () => {
		const { iac } = realizeResourcePlan({ ...PLAN, region: "phx" } as never);
		expect(iac.resources[0]?.inputs.region).toBe("phx");
	});

	it("emits no build spec for a plan that does not build anything", () => {
		// Most resources are provisioned, not built. An empty build spec would
		// make the build lane run for every deployment.
		expect(realizeResourcePlan(PLAN).build).toBeUndefined();
	});

	it("emits a build spec naming the artifact when the plan builds one", () => {
		const { build } = realizeResourcePlan({
			...PLAN,
			build: { artifactId: "a-1", source: "./src", target: "wasm32-wasi" },
		} as never);
		expect(build?.kind).toBe("hobo.build-spec/v1");
		expect(build?.artifacts[0]?.id).toBe("a-1");
	});

	it("realizes several plans into one program whose bind references resolve", () => {
		// The reason multi-resource realize exists: a dependency edge becomes an
		// output reference, and that reference has to resolve against a resource
		// in the *same* program.
		const { iac } = realizeResourcePlans([
			{ name: "db", port: "database" } as never,
			{ name: "api", port: "compute", deps: ["db"] } as never,
		]);
		expect(iac.resources).toHaveLength(2);
		expect(() => assertLocalIacProgram(iac)).not.toThrow();
	});

	it("refuses to realize an empty deployment plan", () => {
		// An empty program would apply cleanly and create nothing — a deploy that
		// reports success and deploys nothing.
		expect(() => realizeResourcePlans([])).toThrow(/cannot realize an empty/u);
	});

	it("honours an explicit deployment id and derives the stack from it", () => {
		// The stack name is the engine's state key. Deriving it here keeps one
		// deployment's state from being written over another's.
		const { iac } = realizeResourcePlans([PLAN], { deploymentId: "d-9" });
		expect(iac.deploymentId).toBe("d-9");
		expect(iac.stack).toBe("hostinger/d-9");
	});
});

describe("transport policy", () => {
	it("allows exactly one host", () => {
		// A one-host allowlist is what makes an exfiltrating resolver a transport
		// error rather than a successful request to somebody else's server.
		expect(hostingerTransportPolicy().allowedHosts).toEqual([
			HOSTINGER_API_HOST,
		]);
	});

	it("allows the vps, dns, and hosting namespaces and nothing else", () => {
		expect([...HOSTINGER_ALLOWED_PATH_PREFIXES]).toEqual([
			"/api/vps/v1/",
			"/api/dns/v1/",
			"/api/hosting/v1/",
		]);
	});

	it("excludes the billing namespace, and says why in the code", () => {
		// The exclusion is exported with its reason attached so a contributor
		// adding a "just provision it" resolver has to read why before widening
		// the policy. This is a spending control, not a tidiness rule.
		expect(HOSTINGER_EXCLUDED_PATH_PREFIXES.billing.prefix).toBe(
			"/api/billing/v1/",
		);
		expect(HOSTINGER_EXCLUDED_PATH_PREFIXES.billing.reason).toContain(
			"spend the account's money",
		);
		expect(
			(HOSTINGER_ALLOWED_PATH_PREFIXES as readonly string[]).includes(
				HOSTINGER_EXCLUDED_PATH_PREFIXES.billing.prefix,
			),
		).toBe(false);
	});

	it("caps the response size and the timeout", () => {
		// These are control-plane calls. A response larger or slower than the cap
		// is a contract change, and treating it as a big success would let an
		// unbounded body into memory.
		const policy = hostingerTransportPolicy();
		expect(policy.maxTimeoutMs).toBe(HOSTINGER_MAX_TIMEOUT_MS);
		expect(policy.maxResponseBytes).toBe(HOSTINGER_MAX_RESPONSE_BYTES);
		expect(HOSTINGER_MAX_RESPONSE_BYTES).toBe(512 * 1024);
	});

	it("returns a frozen policy per call, so no caller can widen a shared one", () => {
		// A function rather than a constant precisely so one caller cannot mutate
		// the allowlist out from under another.
		expect(Object.isFrozen(hostingerTransportPolicy())).toBe(true);
		expect(Object.isFrozen(HOSTINGER_ALLOWED_PATH_PREFIXES)).toBe(true);
	});
});

describe("hostingerApiUrl", () => {
	it("builds an absolute URL on the single allowed host", () => {
		expect(hostingerApiUrl("/api/vps/v1/virtual-machines")).toBe(
			`https://${HOSTINGER_API_HOST}/api/vps/v1/virtual-machines`,
		);
	});

	it("tolerates a path given without a leading slash", () => {
		expect(hostingerApiUrl("api/dns/v1/zones")).toBe(
			`https://${HOSTINGER_API_HOST}/api/dns/v1/zones`,
		);
	});

	it("refuses the billing namespace by name", () => {
		// The refusal a resolver would hit if someone tried to place an order.
		// The message quotes the exclusion's reason, so the person who hits it
		// learns why rather than just that it is blocked.
		try {
			hostingerApiUrl("/api/billing/v1/orders");
			expect.unreachable("billing must be refused");
		} catch (error) {
			expect(error).toBeInstanceOf(HostingerTransportConfigError);
			expect((error as Error).message).toContain("/api/billing/v1/");
			expect((error as Error).message).toContain("spend the account's money");
		}
	});

	it("refuses any other namespace", () => {
		for (const path of [
			"/api/other/v1/x",
			"/",
			"/api/vps/v2/x",
			"/apivps/v1/",
		]) {
			expect(() => hostingerApiUrl(path)).toThrow(
				HostingerTransportConfigError,
			);
		}
	});

	it("joins without re-encoding, so a caller's escaping survives", () => {
		// The doc comment is explicit that this only joins. Silently repairing a
		// path would mean a caller who forgot to encode a name gets a URL that
		// works here and breaks against a name containing a slash.
		expect(hostingerApiUrl("/api/dns/v1/zones/a%2Fb")).toContain("a%2Fb");
	});
});

describe("yard spec rows", () => {
	it("names hostinger as the provider", () => {
		expect(hostingerYardSpec().provider).toBe("hostinger");
	});

	it("carries default regions and honours an override", () => {
		expect(hostingerYardSpec().regions.length).toBeGreaterThan(0);
		expect(hostingerYardSpec({ regions: ["ams"] }).regions).toEqual(["ams"]);
	});

	it("copies the caller's region array rather than holding it", () => {
		// The spec is frozen and long-lived. Holding the caller's array would let
		// a later push change what a already-returned spec reports.
		const regions = ["phx"];
		const spec = hostingerYardSpec({ regions });
		regions.push("ams");
		expect(spec.regions).toEqual(["phx"]);
	});

	it("flattens every catalog binding into a row", () => {
		expect(hostingerYardSpec().bindings.length).toBeGreaterThan(0);
	});

	it("sorts rows by profile, then product, then connectivity", () => {
		// `@hobo/yards` imposes this order, so a round-trip through it must not
		// reshuffle the set — otherwise a generated spec diffs against itself.
		const rows = hostingerYardSpec().bindings;
		const key = (row: (typeof rows)[number]) =>
			`${row.profile} ${row.productId ?? ""} ${row.connectivityId ?? ""}`;
		expect(rows.map(key)).toEqual([...rows.map(key)].sort());
	});

	it("omits an absent productId or connectivityId rather than emitting undefined", () => {
		// Conditional spread. A key present with an undefined value serialises
		// differently to an absent one, and the row is compared structurally.
		for (const row of hostingerYardSpec().bindings) {
			if (!Object.hasOwn(row, "productId")) continue;
			expect(row.productId).toBeDefined();
		}
	});

	it("freezes the spec and every row in it", () => {
		const spec = hostingerYardSpec();
		expect(Object.isFrozen(spec)).toBe(true);
		expect(Object.isFrozen(spec.bindings)).toBe(true);
		for (const row of spec.bindings) expect(Object.isFrozen(row)).toBe(true);
	});

	it("is stable across calls", () => {
		expect(JSON.stringify(hostingerYardSpec())).toBe(
			JSON.stringify(hostingerYardSpec()),
		);
	});
});

describe("event-store fold", () => {
	function signal(kind: string, payload: Record<string, unknown> = {}) {
		return {
			providerId: "hostinger" as const,
			kind,
			payload,
			observedAt: "2026-01-01T00:00:00.000Z",
		} as never;
	}

	it("publishes the resolver id stored events are written under", () => {
		// A rename orphans every fact already written under the old id, so this
		// string is a migration, not a label.
		expect(HOSTINGER_EVENT_STORE_RESOLVER_ID).toBe(
			"hostinger.yard.event-store/v1",
		);
		expect(hostingerEventStoreFoldDescriptor().implementationRef).toContain(
			"hostinger",
		);
	});

	it("folds a created DNS zone into generation-started", () => {
		const [event] = normalizeHostingerYardSignal(
			signal("dns.zone.created", { attemptId: "a-1", zoneId: "z-1" }),
		);
		expect(event?.type).toBe("yard.GenerationProgressed");
		expect(event?.data.status).toBe("started");
		expect((event?.data.externalRefs as Record<string, string>).zoneId).toBe(
			"z-1",
		);
	});

	it("accepts the provider's bare id when no zoneId is spelled out", () => {
		// `p.zoneId ?? p.id`. Hostinger's payloads use both spellings depending on
		// the endpoint, and a fold that knew only one would record an empty
		// external reference — a fact that cannot be joined back to the resource.
		const [event] = normalizeHostingerYardSignal(
			signal("dns.zone.created", { id: "z-9" }),
		);
		expect((event?.data.externalRefs as Record<string, string>).zoneId).toBe(
			"z-9",
		);
	});

	it("folds a created VPS into generation-provisioned", () => {
		const [event] = normalizeHostingerYardSignal(
			signal("vps.created", { virtualMachineId: "vm-1", attemptId: "a-1" }),
		);
		expect(event?.type).toBe("yard.GenerationProvisioned");
		expect(event?.data.yardId).toBe("vm-1");
	});

	it("folds a running VPS into the whole registration sequence", () => {
		// Four events in order: registered, attestation started, attested, ready.
		// A consumer replaying these rebuilds the yard's lifecycle; emitting only
		// `Ready` would produce a yard that exists with no record of being
		// attested.
		const events = normalizeHostingerYardSignal(
			signal("vps.running", { virtualMachineId: "vm-1", attemptId: "a-1" }),
		);
		expect(events.map((event) => event.type)).toEqual([
			"yard.Registered",
			"yard.AttestationStarted",
			"yard.Attested",
			"yard.Ready",
		]);
	});

	it("describes the registered yard with hostinger's substrate requirements", () => {
		const [registered] = normalizeHostingerYardSignal(
			signal("vps.running", { virtualMachineId: "vm-1", regions: ["ams"] }),
		);
		const yard = registered?.data.yard as Record<string, unknown>;
		expect(yard.providerId).toBe("hostinger");
		expect((yard.layout as Record<string, unknown>).regions).toEqual(["ams"]);
		expect((yard.layout as Record<string, string[]>).require).toContain(
			"managed-container-substrate",
		);
	});

	it("defaults the region rather than registering a yard with none", () => {
		// A yard with no region cannot be placed against, so it would be
		// registered and then never selected — present and useless.
		const [registered] = normalizeHostingerYardSignal(
			signal("vps.running", { virtualMachineId: "vm-1" }),
		);
		const layout = (registered?.data.yard as Record<string, unknown>)
			.layout as Record<string, unknown>;
		expect(layout.regions).toEqual(["phx"]);
	});

	it("omits optional account and zone properties when the payload lacks them", () => {
		// Conditional spread again: an empty-string `hostinger.accountRef` would
		// look like a real reference to whatever joined on it.
		const [registered] = normalizeHostingerYardSignal(
			signal("vps.running", { virtualMachineId: "vm-1" }),
		);
		const layout = (registered?.data.yard as Record<string, unknown>)
			.layout as Record<string, Record<string, unknown>>;
		expect(layout.properties).toEqual({});
	});

	it("carries account and zone references through when present", () => {
		const [registered] = normalizeHostingerYardSignal(
			signal("vps.running", {
				virtualMachineId: "vm-1",
				accountRef: "acct-1",
				zoneId: "z-1",
			}),
		);
		const layout = (registered?.data.yard as Record<string, unknown>)
			.layout as Record<string, Record<string, unknown>>;
		expect(layout.properties).toEqual({
			"hostinger.accountRef": "acct-1",
			"hostinger.zoneId": "z-1",
		});
	});

	it("folds a failure into a typed failure fact", () => {
		const [event] = normalizeHostingerYardSignal(
			signal("generation.failed", {
				code: "quota-exceeded",
				message: "no capacity in phx",
				retryable: true,
			}),
		);
		expect(event?.type).toBe("yard.GenerationFailed");
		expect(event?.data.failure).toEqual({
			code: "quota-exceeded",
			message: "no capacity in phx",
			retryable: true,
		});
	});

	it("defaults a failure that named no code or message", () => {
		// A fact with an empty code cannot be dispatched on, and a retry policy
		// reading one would treat every failure the same.
		const [event] = normalizeHostingerYardSignal(signal("generation.failed"));
		expect(event?.data.failure).toEqual({
			code: "hostinger-generation-failed",
			message: "Hostinger yard generation failed",
			retryable: false,
		});
	});

	it("treats anything but a literal true as not retryable", () => {
		// `=== true`. A truthy string like `"false"` from a JSON payload would
		// otherwise put a permanently-failing generation into a retry loop.
		for (const retryable of ["true", 1, {}, "false"]) {
			const [event] = normalizeHostingerYardSignal(
				signal("generation.failed", { retryable }),
			);
			expect((event?.data.failure as Record<string, unknown>).retryable).toBe(
				false,
			);
		}
	});

	it("normalizes an unrecognised signal rather than dropping it", () => {
		// The default arm, and the reason it exists. A dropped signal is a fact
		// that silently never happened; a normalized one is at least in the store
		// for whoever adds the case later.
		const [event] = normalizeHostingerYardSignal(
			signal("vps.snapshot.created", { snapshotId: "s-1" }),
		);
		expect(event?.type).toBe("yard.ProviderSignalNormalized");
		expect(event?.data.kind).toBe("vps.snapshot.created");
		expect(event?.data.payload).toEqual({ snapshotId: "s-1" });
	});

	it("stamps every event with the observation time it was given", () => {
		// The provider's clock, not ours. Restamping with local time would make
		// a replayed backlog look like it all happened at import.
		for (const kind of [
			"dns.zone.created",
			"vps.created",
			"vps.running",
			"generation.failed",
			"unknown.kind",
		]) {
			for (const event of normalizeHostingerYardSignal(signal(kind))) {
				expect(event.occurredAt).toBe("2026-01-01T00:00:00.000Z");
			}
		}
	});

	it("falls back to now when the signal carried no observation time", () => {
		// So an event is never written without a time. An undefined `occurredAt`
		// would sort unpredictably against every other event in the stream.
		const before = Date.now();
		const [event] = normalizeHostingerYardSignal({
			providerId: "hostinger",
			kind: "vps.created",
			payload: {},
		} as never);
		expect(Date.parse(String(event?.occurredAt))).toBeGreaterThanOrEqual(
			before - 1000,
		);
	});
});
