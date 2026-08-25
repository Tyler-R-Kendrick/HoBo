/**
 * The broker's parse boundary, and the layering that sits on top of it.
 *
 * Every constraint in `policies.ts` mirrors an invariant in
 * `data-models/broker.cue`, and the whole point of the module is that a value
 * violating one of them never exists past it. That makes the refusals the
 * product, not the error handling: a policy set that parses is a policy set the
 * rest of the broker is entitled to trust without re-checking.
 *
 * Three things are worth stating about what these cover.
 *
 * **Both spellings, everywhere.** Every field is read as
 * `raw.camelCase ?? raw.snake_case`, because policy documents arrive both from
 * TypeScript callers and from YAML written by operators. A test that only ever
 * passes camelCase leaves half of those reads unexercised, and the failure mode
 * is silent: a snake_case field is not rejected, it is *ignored*, so the value
 * falls back to a default and the policy quietly does something other than what
 * was written.
 *
 * **Cross-field invariants are the interesting refusals.** Anyone can check
 * that a string is a string. `quotaUsed <= quotaLimit`, `objective: pinned`
 * requiring a provider, and `engine: argo` requiring a repo and a namespace are
 * the constraints that encode what the broker actually means, and the ones a
 * refactor is most likely to drop.
 *
 * **Restrictions accumulate outward-in.** `effectivePlacementPolicy` merges
 * layers from junction to bindle, and the direction is not symmetric: choice
 * fields take the narrower layer's answer, but denied providers union and
 * `requireExplicitCamps` ORs. A junction broker admin's lockdown must not be
 * removable by someone who can write a bindle-scoped policy. That is a
 * privilege boundary, so it is tested from the attacker's direction — a
 * narrower policy that tries to relax an outer restriction.
 */
import { describe, expect, it } from "vitest";

import {
	BrokerParseError,
	effectivePlacementPolicy,
	parseBillingPolicy,
	parseBrokerPolicySet,
	parseBrokerRequest,
	parseDeliveryPolicy,
	parsePlacementPolicy,
	parseResourceRequirement,
	parseTopologyScope,
} from "../src/policies.js";
import { BROKER_SCHEMA_VERSION } from "../src/types.js";

/** The code carried by a refusal, or the string that was thrown instead. */
function codeOf(run: () => unknown): string {
	try {
		run();
	} catch (error) {
		if (error instanceof BrokerParseError) return error.code;
		return `not-a-parse-error: ${String(error)}`;
	}
	return "no-refusal";
}

const placement = (over: Record<string, unknown> = {}) => ({
	id: "p1",
	scopeKind: "bindle",
	objective: "min-cost",
	...over,
});

describe("placement policies", () => {
	it("refuses anything that is not an object", () => {
		// Including an array, which `typeof` alone would call an object and let
		// through as a record with numeric keys.
		expect(codeOf(() => parsePlacementPolicy([] as never))).toBe(
			"invalid-placement-policy",
		);
		expect(codeOf(() => parsePlacementPolicy(null))).toBe(
			"invalid-placement-policy",
		);
		expect(codeOf(() => parsePlacementPolicy("p1" as never))).toBe(
			"invalid-placement-policy",
		);
	});

	it("refuses an empty id as firmly as a missing one", () => {
		// An empty string is falsy in the places this id is later used, so
		// accepting it would produce a policy that silently matches nothing.
		expect(
			codeOf(() => parsePlacementPolicy(placement({ id: "" }) as never)),
		).toBe("invalid-placement-policy");
	});

	it("accepts the snake_case spelling of every aliased field", () => {
		// The silent failure mode: an ignored snake_case field is not rejected,
		// it falls back to a default, and the policy does something other than
		// what the operator wrote.
		const parsed = parsePlacementPolicy({
			id: "p1",
			scope_kind: "camp",
			objective: "pinned",
			pinned_provider_id: "aws",
			require_explicit_camps: true,
		} as never);
		expect(parsed.scopeKind).toBe("camp");
		expect(parsed.pinnedProviderId).toBe("aws");
		expect(parsed.requireExplicitCamps).toBe(true);
	});

	it("refuses a scope kind outside the known set", () => {
		expect(
			codeOf(() =>
				parsePlacementPolicy(placement({ scopeKind: "tenant" }) as never),
			),
		).toBe("invalid-scope-kind");
	});

	it("refuses an objective outside the known set", () => {
		expect(
			codeOf(() =>
				parsePlacementPolicy(placement({ objective: "fastest" }) as never),
			),
		).toBe("invalid-objective");
	});

	it("refuses the pinned objective with no provider named", () => {
		// The dependent constraint from broker.cue. Without it a 'pinned' policy
		// would parse and then place anywhere, which is the opposite of what
		// pinning means.
		expect(
			codeOf(() =>
				parsePlacementPolicy(placement({ objective: "pinned" }) as never),
			),
		).toBe("pinned-provider-required");
	});

	it("treats an empty pinned provider as absent", () => {
		// `optionalString` requires a non-empty string, so `pinnedProviderId: ""`
		// has to trip the same refusal rather than pinning to nothing.
		expect(
			codeOf(() =>
				parsePlacementPolicy(
					placement({ objective: "pinned", pinnedProviderId: "" }) as never,
				),
			),
		).toBe("pinned-provider-required");
	});

	it("locks down explicit camps only on a literal true", () => {
		// `=== true`, not truthiness. A lockdown flag that turned on for the
		// string "false" would be the worst possible direction for this bug to
		// go, so the non-boolean cases are pinned.
		const on = parsePlacementPolicy(
			placement({ requireExplicitCamps: true }) as never,
		);
		expect(on.requireExplicitCamps).toBe(true);
		for (const value of ["true", 1, {}, []]) {
			expect(
				parsePlacementPolicy(
					placement({ requireExplicitCamps: value }) as never,
				).requireExplicitCamps,
			).toBe(false);
		}
	});
});

describe("billing policies", () => {
	it("defaults every amount to zero rather than refusing", () => {
		// A policy set that has not configured spend yet is legitimate; the
		// numbers are floors, not requirements.
		const parsed = parseBillingPolicy({ quota: "standard" } as never);
		expect(parsed.quotaUsed).toBe(0);
		expect(parsed.quotaLimit).toBe(0);
		expect(parsed.budgetUsd).toBe(0);
		expect(parsed.spendCapUsd).toBe(0);
	});

	it("requires a quota name", () => {
		expect(codeOf(() => parseBillingPolicy({} as never))).toBe(
			"invalid-billing-policy",
		);
	});

	it("refuses a negative amount", () => {
		// Negative consumption would make every downstream comparison against a
		// limit pass.
		expect(
			codeOf(() =>
				parseBillingPolicy({ quota: "standard", quotaUsed: -1 } as never),
			),
		).toBe("invalid-billing-policy");
	});

	it("refuses NaN, which compares false against every limit", () => {
		// The reason NaN is called out separately from "not a number": it *is* a
		// number, and `NaN < 0` is false, so a check that only tested the sign
		// would let it through — and then `quotaUsed > quotaLimit` is false too,
		// so an unbounded spend would pass the overflow gate.
		expect(
			codeOf(() =>
				parseBillingPolicy({ quota: "standard", quotaUsed: NaN } as never),
			),
		).toBe("invalid-billing-policy");
	});

	it("refuses consumed quota above the limit", () => {
		expect(
			codeOf(() =>
				parseBillingPolicy({
					quota: "standard",
					quota_used: 10,
					quota_limit: 5,
				} as never),
			),
		).toBe("quota-overflow");
	});

	it("allows consumption exactly at the limit", () => {
		// `>`, not `>=`: a fully consumed quota is a real state, not a corrupt
		// one, and refusing it here would make the policy unparseable at exactly
		// the moment the broker most needs to read it.
		expect(
			parseBillingPolicy({
				quota: "standard",
				quotaUsed: 5,
				quotaLimit: 5,
			} as never).quotaUsed,
		).toBe(5);
	});
});

describe("delivery policies", () => {
	it("refuses an unknown engine", () => {
		expect(codeOf(() => parseDeliveryPolicy({ engine: "flux" } as never))).toBe(
			"invalid-delivery-engine",
		);
	});

	it("defaults the sync mode to manual", () => {
		// Manual, because automatic sync is the one that acts on its own; a
		// missing field must not opt an operator into that.
		expect(parseDeliveryPolicy({ engine: "in-proc" } as never).syncMode).toBe(
			"manual",
		);
	});

	it("refuses an unknown sync mode", () => {
		expect(
			codeOf(() =>
				parseDeliveryPolicy({
					engine: "in-proc",
					sync_mode: "hourly",
				} as never),
			),
		).toBe("invalid-sync-mode");
	});

	it("requires a repo and a namespace for argo", () => {
		// The dependent constraint: argo without a destination would parse and
		// then fail at delivery time, far from the policy that caused it.
		expect(
			codeOf(() =>
				parseDeliveryPolicy({ engine: "argo", gitopsRepo: "g" } as never),
			),
		).toBe("argo-destination-required");
		expect(
			codeOf(() =>
				parseDeliveryPolicy({
					engine: "argo",
					destinationNamespace: "n",
				} as never),
			),
		).toBe("argo-destination-required");
	});

	it("accepts argo with both, in either spelling", () => {
		const parsed = parseDeliveryPolicy({
			engine: "argo",
			gitops_repo: "git://repo",
			destination_namespace: "apps",
			sync_mode: "auto",
			prune: true,
		} as never);
		expect(parsed.gitopsRepo).toBe("git://repo");
		expect(parsed.destinationNamespace).toBe("apps");
		expect(parsed.syncMode).toBe("auto");
		expect(parsed.prune).toBe(true);
	});

	it("does not demand a destination for in-proc", () => {
		const parsed = parseDeliveryPolicy({ engine: "in-proc" } as never);
		expect(parsed.gitopsRepo).toBeUndefined();
		expect(parsed.prune).toBe(false);
	});
});

describe("policy sets", () => {
	const set = (over: Record<string, unknown> = {}) => ({
		schemaVersion: BROKER_SCHEMA_VERSION,
		brokerId: "b1",
		billing: { quota: "standard" },
		...over,
	});

	it("refuses a policy set that omits billing, naming the missing block", () => {
		// Billing is required — quota is a policy someone chose, and there is no
		// honest default to invent. What matters is *which* refusal: this used to
		// fall into `parseBillingPolicy({})` and report "quota must be a non-empty
		// string" against a billing block the operator never wrote. The refusal
		// now names the block, so the fix it points at is the real one.
		try {
			parseBrokerPolicySet({
				schemaVersion: BROKER_SCHEMA_VERSION,
				brokerId: "b1",
			} as never);
			throw new Error("expected a refusal");
		} catch (error) {
			expect((error as BrokerParseError).code).toBe("invalid-policy-set");
			expect((error as Error).message).toMatch(/billing is required/u);
		}
	});

	it("refuses a schema version it does not implement", () => {
		// Pinned rather than range-checked: a policy document from a future
		// broker may mean something different by the same field names.
		expect(
			codeOf(() => parseBrokerPolicySet(set({ schemaVersion: "v0" }) as never)),
		).toBe("unsupported-schema");
	});

	it("defaults to no placement policies rather than refusing", () => {
		const parsed = parseBrokerPolicySet(set() as never);
		expect(parsed.placementPolicies).toEqual([]);
	});

	it("ignores a placement list that is not a list", () => {
		// Falls back to empty. Worth pinning as the deliberate choice it is:
		// the alternative is a refusal, and the broker prefers to run with no
		// placement policy than not at all.
		expect(
			parseBrokerPolicySet(set({ placement_policies: "all" }) as never)
				.placementPolicies,
		).toEqual([]);
	});

	it("parses each placement policy through the same boundary", () => {
		// Nested documents are not trusted just because their parent was.
		expect(
			codeOf(() =>
				parseBrokerPolicySet(
					set({
						placementPolicies: [placement({ objective: "fastest" })],
					}) as never,
				),
			),
		).toBe("invalid-objective");
	});

	it("refuses a required connector kind outside the known set", () => {
		expect(
			codeOf(() =>
				parseBrokerPolicySet(
					set({ required_connector_kinds: ["smoke-signal"] }) as never,
				),
			),
		).toBe("invalid-connector-kind");
	});

	it("supplies in-proc delivery and a zero billing policy by default", () => {
		// So a minimal policy set is usable rather than merely parseable.
		const parsed = parseBrokerPolicySet(set() as never);
		expect(parsed.delivery.engine).toBe("in-proc");
		expect(parsed.billing.quotaLimit).toBe(0);
	});
});

describe("broker requests", () => {
	const request = (over: Record<string, unknown> = {}) => ({
		schemaVersion: BROKER_SCHEMA_VERSION,
		requestId: "r1",
		scope: { bindleId: "app" },
		requirements: [{ resourceId: "db", port: "hobo:sql" }],
		...over,
	});

	it("refuses a request that names no scope, naming the missing block", () => {
		// A request must name at least the bindle it is placing into. This used
		// to fall into `parseTopologyScope({})` and refuse over a missing
		// bindleId inside a scope block the caller never wrote; it now says the
		// scope itself is missing, which is the fix the caller actually needs.
		try {
			parseBrokerRequest({
				schemaVersion: BROKER_SCHEMA_VERSION,
				requestId: "r1",
				requirements: [{ resourceId: "db", port: "hobo:sql" }],
			} as never);
			throw new Error("expected a refusal");
		} catch (error) {
			expect((error as BrokerParseError).code).toBe("invalid-request");
			expect((error as Error).message).toMatch(/scope is required/u);
		}
	});

	it("refuses a request that places nothing", () => {
		// An empty requirements list is not an empty success — it is a caller
		// bug, and answering it with an empty receipt would look like a
		// completed placement.
		expect(
			codeOf(() => parseBrokerRequest(request({ requirements: [] }) as never)),
		).toBe("empty-requirements");
		expect(
			codeOf(() => parseBrokerRequest(request({ requirements: {} }) as never)),
		).toBe("empty-requirements");
	});

	it("refuses a schema version it does not implement", () => {
		// Built without the camelCase spelling: `raw.schemaVersion ?? raw.schema_version`
		// reads the camelCase one first, so passing both would test nothing.
		expect(
			codeOf(() =>
				parseBrokerRequest({
					schema_version: "v0",
					requestId: "r1",
					scope: { bindleId: "app" },
					requirements: [{ resourceId: "db", port: "hobo:sql" }],
				} as never),
			),
		).toBe("unsupported-schema");
	});

	it("defaults the scope to bindle-only and the estimate to zero", () => {
		const parsed = parseBrokerRequest(
			request({ scope: { bindleId: "app" } }) as never,
		);
		expect(parsed.scope.campId).toBeUndefined();
		expect(parsed.spendEstimateUsd).toBe(0);
	});

	it("reads the snake_case spelling of the request id and estimate", () => {
		const parsed = parseBrokerRequest({
			schema_version: BROKER_SCHEMA_VERSION,
			request_id: "r2",
			scope: { bindle_id: "app" },
			requirements: [{ resource_id: "db", port: "hobo:sql" }],
			spend_estimate_usd: 12.5,
		} as never);
		expect(parsed.requestId).toBe("r2");
		expect(parsed.spendEstimateUsd).toBe(12.5);
		expect(parsed.requirements[0]?.resourceId).toBe("db");
	});
});

describe("topology scopes and requirements", () => {
	it("omits absent scope levels rather than carrying undefined keys", () => {
		// `effectivePlacementPolicy` decides which layers apply by testing these
		// for `undefined`, so a present-but-undefined key and an absent one have
		// to stay indistinguishable.
		const parsed = parseTopologyScope({ bindle_id: "app" } as never);
		expect(Object.keys(parsed)).toEqual(["bindleId"]);
	});

	it("reads every scope level in either spelling", () => {
		const parsed = parseTopologyScope({
			bindleId: "app",
			camp_id: "c",
			yard_id: "y",
			junction_id: "j",
		} as never);
		expect(parsed).toEqual({
			bindleId: "app",
			campId: "c",
			yardId: "y",
			junctionId: "j",
		});
	});

	it("drops non-string entries from a feature list instead of refusing", () => {
		const parsed = parseResourceRequirement({
			resourceId: "db",
			port: "hobo:sql",
			features: ["ha", 7, "", null, "backup"],
		} as never);
		expect(parsed.features).toEqual(["ha", "backup"]);
	});

	it("requires a port", () => {
		// The port is what the requirement is *for*; without it there is nothing
		// to match a provider against.
		expect(
			codeOf(() => parseResourceRequirement({ resourceId: "db" } as never)),
		).toBe("invalid-requirement");
	});
});

describe("layering placement policies", () => {
	function policies(...layers: Array<Record<string, unknown>>) {
		return parseBrokerPolicySet({
			schemaVersion: BROKER_SCHEMA_VERSION,
			brokerId: "b1",
			billing: { quota: "standard" },
			placementPolicies: layers,
		} as never);
	}

	const scope = {
		bindleId: "app",
		campId: "c",
		yardId: "y",
		junctionId: "j",
	} as never;

	it("returns nothing when no layer applies to the scope", () => {
		// A junction-scoped policy against a bindle-only scope. Returning a
		// policy here would apply a restriction the operator scoped elsewhere.
		expect(
			effectivePlacementPolicy(
				policies(placement({ id: "j1", scopeKind: "junction" })),
				{ bindleId: "app" } as never,
			),
		).toBeUndefined();
	});

	it("lets the narrower layer win a choice-shaped field", () => {
		// bindle overrides camp overrides yard overrides junction.
		const merged = effectivePlacementPolicy(
			policies(
				placement({ id: "j1", scopeKind: "junction", objective: "min-cost" }),
				placement({
					id: "b1",
					scopeKind: "bindle",
					objective: "pinned",
					pinnedProviderId: "aws",
				}),
			),
			scope,
		);
		expect(merged?.objective).toBe("pinned");
		expect(merged?.id).toBe("b1");
	});

	it("accumulates denied providers instead of replacing them", () => {
		// The privilege boundary, tested from the attacker's direction: a
		// bindle-scoped policy denying only 'gcp' must not thereby re-permit the
		// 'aws' a junction admin denied.
		const merged = effectivePlacementPolicy(
			policies(
				placement({
					id: "j1",
					scopeKind: "junction",
					deniedProviders: ["aws"],
				}),
				placement({
					id: "b1",
					scopeKind: "bindle",
					deniedProviders: ["gcp"],
				}),
			),
			scope,
		);
		expect([...(merged?.deniedProviders ?? [])].sort()).toEqual(["aws", "gcp"]);
	});

	it("cannot have an outer explicit-camp lockdown switched off inward", () => {
		// `||`, so a narrower policy omitting the flag leaves it on.
		const merged = effectivePlacementPolicy(
			policies(
				placement({
					id: "j1",
					scopeKind: "junction",
					requireExplicitCamps: true,
				}),
				placement({
					id: "b1",
					scopeKind: "bindle",
					requireExplicitCamps: false,
				}),
			),
			scope,
		);
		expect(merged?.requireExplicitCamps).toBe(true);
	});

	it("keeps an outer allow-list when the narrower layer states none", () => {
		// An empty list means "did not say", not "allow everything" — the
		// opposite reading would let an empty bindle policy erase a junction
		// admin's allow-list.
		const merged = effectivePlacementPolicy(
			policies(
				placement({
					id: "j1",
					scopeKind: "junction",
					allowedProviders: ["aws"],
				}),
				placement({ id: "b1", scopeKind: "bindle" }),
			),
			scope,
		);
		expect(merged?.allowedProviders).toEqual(["aws"]);
	});

	it("records every contributing layer, outermost first", () => {
		// So a receipt can name the policies that produced a placement, which is
		// what makes a surprising decision traceable to the rule behind it.
		const merged = effectivePlacementPolicy(
			policies(
				placement({ id: "b1", scopeKind: "bindle" }),
				placement({ id: "j1", scopeKind: "junction" }),
				placement({ id: "y1", scopeKind: "yard" }),
			),
			scope,
		);
		expect(merged?.contributingPolicyIds).toEqual(["j1", "y1", "b1"]);
	});
});
