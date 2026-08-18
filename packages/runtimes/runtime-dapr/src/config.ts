import { MessagingParseError } from "@hobo/core";

import type { DaprDeployMode, DaprRuntimeConfig } from "./types.js";

function nonEmpty(value: unknown, field: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new MessagingParseError(field, "non-empty string", value);
	}
	return value;
}

export function parseDaprDeployMode(value: unknown): DaprDeployMode {
	if (value === "self-hosted" || value === "kubernetes") return value;
	throw new MessagingParseError("mode", "self-hosted|kubernetes", value);
}

/**
 * Tenant-scope Dapr app-id (multi-tenant default).
 * Physical form: `{tenant}.{camp}.{app}` unless already scoped.
 */
export function tenantScopedAppId(
	tenantId: string,
	campId: string,
	app: string,
): string {
	const tenant = nonEmpty(tenantId, "tenantId");
	const camp = nonEmpty(campId, "campId");
	const name = nonEmpty(app, "app");
	if (name.startsWith(`${tenant}.`)) return name;
	return `${tenant}.${camp}.${name}`;
}

export function parseDaprRuntimeConfig(input: unknown): DaprRuntimeConfig {
	if (!input || typeof input !== "object") {
		throw new MessagingParseError("DaprRuntimeConfig", "object", input);
	}
	const src = input as Record<string, unknown>;
	const tenantId = nonEmpty(src.tenantId ?? src.tenant_id, "tenantId");
	const campId = nonEmpty(src.campId ?? src.camp_id, "campId");
	const app = nonEmpty(src.appId ?? src.app_id ?? "app", "appId");
	const mode = parseDaprDeployMode(src.mode ?? "self-hosted");
	const config: DaprRuntimeConfig = {
		campId,
		tenantId,
		appId: tenantScopedAppId(tenantId, campId, app),
		mode,
		httpEndpoint: String(
			src.httpEndpoint ?? src.http_endpoint ?? "http://127.0.0.1:3500",
		),
		actorsEnabled: Boolean(src.actorsEnabled ?? src.actors_enabled ?? true),
		pubsubEnabled: Boolean(src.pubsubEnabled ?? src.pubsub_enabled ?? true),
		workflowEnabled: Boolean(
			src.workflowEnabled ?? src.workflow_enabled ?? false,
		),
		defaultPubsubName: String(
			src.defaultPubsubName ?? src.default_pubsub_name ?? "pubsub",
		),
		svidBindingRef: nonEmpty(
			src.svidBindingRef ?? src.svid_binding_ref ?? "fromBinding:svid",
			"svidBindingRef",
		),
		...(src.grpcEndpoint || src.grpc_endpoint
			? { grpcEndpoint: String(src.grpcEndpoint ?? src.grpc_endpoint) }
			: {}),
		...(src.placementAddress || src.placement_address
			? {
					placementAddress: String(
						src.placementAddress ?? src.placement_address,
					),
				}
			: {}),
	};
	return Object.freeze(config);
}

export function defaultDaprRuntimeConfig(
	tenantId: string,
	campId: string,
): DaprRuntimeConfig {
	return parseDaprRuntimeConfig({
		tenantId,
		campId,
		appId: "app",
		mode: "self-hosted",
		actorsEnabled: true,
		pubsubEnabled: true,
		workflowEnabled: true,
		defaultPubsubName: "pubsub",
		svidBindingRef: "fromBinding:svid",
	});
}
