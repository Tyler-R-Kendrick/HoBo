import {
	RivetJournalError,
	type RivetRuntimeConfig,
	type RivetRuntimeMode,
} from "./types.js";

const MODES = new Set<RivetRuntimeMode>([
	"local",
	"runner",
	"serverless",
	"managed",
]);

export function parseRivetRuntimeMode(value: unknown): RivetRuntimeMode {
	if (typeof value === "string" && MODES.has(value as RivetRuntimeMode)) {
		return value as RivetRuntimeMode;
	}
	throw new RivetJournalError(
		"PARSE",
		`rivet runtime mode must be local|runner|serverless|managed, got ${JSON.stringify(value)}`,
	);
}

export function parseRivetRuntimeConfig(input: unknown): RivetRuntimeConfig {
	if (typeof input !== "object" || input === null) {
		throw new RivetJournalError(
			"PARSE",
			"rivet runtime config must be an object",
		);
	}
	const record = input as Record<string, unknown>;
	const campId = record.campId ?? record.camp_id;
	const tenantId = record.tenantId ?? record.tenant_id;
	if (typeof campId !== "string" || campId.length === 0) {
		throw new RivetJournalError("PARSE", "campId is required");
	}
	if (typeof tenantId !== "string" || tenantId.length === 0) {
		throw new RivetJournalError("PARSE", "tenantId is required");
	}
	const svid = record.svidBindingRef ?? record.svid_binding_ref;
	if (typeof svid !== "string" || svid.length === 0) {
		throw new RivetJournalError("PARSE", "svidBindingRef is required");
	}
	if (svid.startsWith("secret:") || /token|password|sk-/iu.test(svid)) {
		throw new RivetJournalError(
			"PARSE",
			"svidBindingRef must be a locator, not secret material",
		);
	}
	const endpoint = record.endpointSecretRef ?? record.endpoint_secret_ref;
	const admin = record.adminTokenSecretRef ?? record.admin_token_secret_ref;
	for (const [path, value] of [
		["endpointSecretRef", endpoint],
		["adminTokenSecretRef", admin],
	] as const) {
		if (
			value !== undefined &&
			typeof value === "string" &&
			value.includes("://")
		) {
			throw new RivetJournalError(
				"PARSE",
				`${path} must be a secretRef locator, not a URL with userinfo`,
			);
		}
	}
	return Object.freeze({
		campId,
		tenantId,
		mode: parseRivetRuntimeMode(record.mode ?? "local"),
		...(typeof record.engineImageDigest === "string"
			? { engineImageDigest: record.engineImageDigest }
			: {}),
		...(typeof endpoint === "string" ? { endpointSecretRef: endpoint } : {}),
		...(typeof admin === "string" ? { adminTokenSecretRef: admin } : {}),
		svidBindingRef: svid,
	});
}
