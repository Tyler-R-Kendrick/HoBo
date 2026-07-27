import { spawnSync } from "node:child_process";

import {
	type MeteringBus,
	type PolicyDecision,
	type PolicyEngine,
	type PolicyRequest,
	allowDecision,
	createUsageEvent,
	denyDecision,
} from "@hobo/core";

// public-contract: engine id for the OPA/Rego PolicyEngine adapter.
export const OPA_POLICY_ENGINE_ID = "hobo.policy.opa-rego/v1" as const;

export interface OpaPolicyEngineOptions {
	readonly metering?: MeteringBus;
	/**
	 * OPA REST data URL that accepts POST { input } → { result: { allow?: bool, reasons?: string[] } }.
	 * Example: http://127.0.0.1:8181/v1/data/hobo/authz/allow
	 */
	readonly opaUrl?: string;
	readonly fetchImpl?: typeof fetch;
	/** Inline Rego package path for `opa eval` CLI (optional). */
	readonly regoPackage?: string;
	readonly regoModulePath?: string;
	readonly opaBin?: string;
	/**
	 * In-process fallback evaluator used when OPA is unavailable.
	 * Default enforces same-tenant unless resource.attributes.shared === "true",
	 * and evaluates simple `input.subject.tags[_] == "role:admin"` style allow tags.
	 */
	readonly fallback?: (request: PolicyRequest) => PolicyDecision;
}

/**
 * OPA/Rego PolicyEngine adapter.
 * Prefers HTTP to a running OPA; falls back to `opa eval` CLI; then in-process tenant isolation.
 */
export function createOpaPolicyEngine(
	options: OpaPolicyEngineOptions = {},
): PolicyEngine {
	const fetchImpl = options.fetchImpl ?? fetch;
	const fallback =
		options.fallback ??
		((request: PolicyRequest) => defaultRegoLikeEval(request));

	return {
		engineId: OPA_POLICY_ENGINE_ID,
		async evaluate(request: PolicyRequest): Promise<PolicyDecision> {
			let decision: PolicyDecision | null = null;

			if (options.opaUrl) {
				try {
					const res = await fetchImpl(options.opaUrl, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ input: toOpaInput(request) }),
					});
					if (res.ok) {
						const body = (await res.json()) as {
							result?:
								| boolean
								| {
										allow?: boolean;
										reasons?: string[];
										obligations?: string[];
								  };
						};
						decision = fromOpaResult(request, body.result);
					}
				} catch {
					// fall through
				}
			}

			if (decision === null && options.regoModulePath) {
				decision = evalViaOpaCli(request, {
					bin: options.opaBin ?? "opa",
					modulePath: options.regoModulePath,
					packagePath: options.regoPackage ?? "data.hobo.authz",
				});
			}

			if (decision === null) {
				decision = fallback(request);
			}

			if (options.metering) {
				await options.metering.emit(
					createUsageEvent({
						tenantId: request.subject.tenantId,
						eventType: "policy.evaluate",
						resource: `${request.resource.kind}:${request.resource.id}`,
						metadata: {
							effect: decision.effect,
							action: request.action,
							engineId: OPA_POLICY_ENGINE_ID,
						},
					}),
				);
			}
			return decision;
		},
	};
}

function toOpaInput(request: PolicyRequest): Record<string, unknown> {
	return {
		subject: {
			identity: request.subject.identity,
			tenant_id: request.subject.tenantId,
			tags: request.subject.tags,
			attributes: request.subject.attributes ?? {},
		},
		action: request.action,
		resource: {
			kind: request.resource.kind,
			id: request.resource.id,
			tenant_id: request.resource.tenantId,
			tags: request.resource.tags ?? [],
			attributes: request.resource.attributes ?? {},
		},
		context: request.context ?? {},
	};
}

function fromOpaResult(
	request: PolicyRequest,
	result: unknown,
): PolicyDecision {
	if (typeof result === "boolean") {
		return result
			? allowDecision(OPA_POLICY_ENGINE_ID, request, ["opa:allow"])
			: denyDecision(OPA_POLICY_ENGINE_ID, request, ["opa:deny"]);
	}
	if (result && typeof result === "object") {
		const obj = result as {
			allow?: boolean;
			reasons?: string[];
			obligations?: string[];
		};
		if (obj.allow === true) {
			return allowDecision(
				OPA_POLICY_ENGINE_ID,
				request,
				obj.reasons ?? ["opa:allow"],
				obj.obligations,
			);
		}
		return denyDecision(
			OPA_POLICY_ENGINE_ID,
			request,
			obj.reasons ?? ["opa:deny"],
		);
	}
	return denyDecision(OPA_POLICY_ENGINE_ID, request, ["opa:empty-result"]);
}

function evalViaOpaCli(
	request: PolicyRequest,
	opts: { bin: string; modulePath: string; packagePath: string },
): PolicyDecision | null {
	const inputJson = JSON.stringify(toOpaInput(request));
	const result = spawnSync(
		opts.bin,
		[
			"eval",
			"-f",
			"json",
			"-d",
			opts.modulePath,
			"-I",
			`${opts.packagePath}.allow`,
		],
		{
			encoding: "utf8",
			input: inputJson,
		},
	);
	if (result.status !== 0) return null;
	try {
		const parsed = JSON.parse(result.stdout) as {
			result?: readonly { expressions?: readonly { value?: unknown }[] }[];
		};
		const value = parsed.result?.[0]?.expressions?.[0]?.value;
		return fromOpaResult(request, value);
	} catch {
		return null;
	}
}

/**
 * Minimal Rego-like semantics used when OPA is not running:
 * allow if same tenant OR shared; deny cross-tenant; honor require:* tags.
 */
export function defaultRegoLikeEval(request: PolicyRequest): PolicyDecision {
	const sameTenant = request.subject.tenantId === request.resource.tenantId;
	const shared =
		request.resource.tags?.includes("shared:true") === true ||
		request.resource.attributes?.shared === "true";

	if (!sameTenant && !shared) {
		return denyDecision(OPA_POLICY_ENGINE_ID, request, [
			"rego-fallback: cross-tenant access denied",
		]);
	}

	const required = (request.resource.tags ?? []).filter((t) =>
		t.startsWith("require:"),
	);
	const missing = required.filter(
		(tag) => !request.subject.tags.includes(tag.slice("require:".length)),
	);
	if (missing.length > 0) {
		return denyDecision(OPA_POLICY_ENGINE_ID, request, [
			`rego-fallback: missing tags ${missing.join(", ")}`,
		]);
	}

	// Optional: actions ending in .admin require role:admin
	if (
		request.action.endsWith(".admin") &&
		!request.subject.tags.includes("role:admin")
	) {
		return denyDecision(OPA_POLICY_ENGINE_ID, request, [
			"rego-fallback: role:admin required",
		]);
	}

	return allowDecision(OPA_POLICY_ENGINE_ID, request, [
		"rego-fallback: allow",
	]);
}

/** Sample Rego module string operators can drop into OPA. */
export const SAMPLE_HOBO_AUTHZ_REGO = `package hobo.authz

default allow := false

allow if {
  input.subject.tenant_id == input.resource.tenant_id
}

allow if {
  input.resource.attributes.shared == "true"
}

allow if {
  "shared:true" in input.resource.tags
}
`;
