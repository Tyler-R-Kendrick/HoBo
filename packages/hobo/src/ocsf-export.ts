import { createHash } from "node:crypto";

import type { CredentialAuditRow, CredentialGrantAudit } from "@hobo/cloud";

// OCSF evidence export for HoBo's credential-audit facts (FR/attest, NFR-018).
// It maps the replayable `CredentialAuditRow` (grant -> use -> revoke, folded
// from the durable log) onto OCSF 1.x "Authorization" activity records so
// external GRC/SIEM tools can ingest HoBo's credential lifecycle. The OCSF
// taxonomy codes below are the SAME as the src/draft OCSF-export contract proof
// (the source of truth): token facts are category 3 (Identity & Access
// Management), class 3004 (Authorization).

export const OCSF_EXPORT_VERSION = "hobo.identity-ocsf-export/v1";

const OCSF_CATEGORY_UID = 3;
const OCSF_CATEGORY_NAME = "Identity & Access Management";
const OCSF_AUTHORIZATION_CLASS_UID = 3004;
const OCSF_AUTHORIZATION_CLASS_NAME = "Authorization";

// activity_id per the draft OCSF_MAPPING: Granted=1, Used=2, Revoked=4.
const ACTIVITY_BY_STATUS = {
	granted: { id: 1, name: "Token Granted" },
	used: { id: 2, name: "Token Used" },
	revoked: { id: 4, name: "Token Revoked" },
} as const;

export interface OcsfCredentialChain {
	readonly grantId: string;
	readonly svidSubject?: string;
	readonly tokenRef?: string;
	readonly scope?: { port: string; resource: string; action: string };
	readonly grantedAt?: string;
	readonly usedAt?: string;
	readonly revokedAt?: string;
	readonly useCount: number;
}

export interface OcsfAuthorizationRecord {
	readonly schema_version: "ocsf-1.x";
	readonly category_uid: typeof OCSF_CATEGORY_UID;
	readonly category_name: typeof OCSF_CATEGORY_NAME;
	readonly class_uid: typeof OCSF_AUTHORIZATION_CLASS_UID;
	readonly class_name: typeof OCSF_AUTHORIZATION_CLASS_NAME;
	readonly activity_id: number;
	readonly activity_name: string;
	readonly type_uid: number;
	readonly severity_id: number;
	readonly status: string;
	readonly message: string;
	readonly metadata: {
		readonly version: string;
		readonly product: { readonly name: string; readonly vendor_name: string };
	};
	readonly hobo: {
		readonly export_kind: "credential-audit";
		readonly export_version: typeof OCSF_EXPORT_VERSION;
		readonly correlation_id: string;
		readonly credential_chain: OcsfCredentialChain;
	};
}

export interface OcsfBatch {
	readonly export_version: typeof OCSF_EXPORT_VERSION;
	readonly correlationId: string;
	// Monotonic when the source timeline is ordered; otherwise labeled with a
	// reason (mirrors the draft contract's ordering guarantee).
	readonly ordering: {
		readonly mode: "ordered" | "unordered";
		readonly reason?: string;
	};
	readonly records: readonly OcsfAuthorizationRecord[];
	// A content digest over the canonical records — an integrity seal for the
	// export. (Cryptographic KMS/JWT signing over this digest is a follow-up.)
	readonly sealDigest: string;
}

function chainFor(grant: CredentialGrantAudit): OcsfCredentialChain {
	return {
		grantId: grant.grantId,
		...(grant.svidSubject !== undefined
			? { svidSubject: grant.svidSubject }
			: {}),
		...(grant.tokenRef !== undefined ? { tokenRef: grant.tokenRef } : {}),
		...(grant.scope !== undefined ? { scope: grant.scope } : {}),
		...(grant.grantedAt !== undefined ? { grantedAt: grant.grantedAt } : {}),
		...(grant.usedAt !== undefined ? { usedAt: grant.usedAt } : {}),
		...(grant.revokedAt !== undefined ? { revokedAt: grant.revokedAt } : {}),
		useCount: grant.useCount,
	};
}

function recordFor(
	correlationId: string,
	grant: CredentialGrantAudit,
): OcsfAuthorizationRecord {
	const activity = ACTIVITY_BY_STATUS[grant.status];
	// A revoked grant is a benign, expected end-of-life (severity Informational=1).
	const severity_id = 1;
	return {
		schema_version: "ocsf-1.x",
		category_uid: OCSF_CATEGORY_UID,
		category_name: OCSF_CATEGORY_NAME,
		class_uid: OCSF_AUTHORIZATION_CLASS_UID,
		class_name: OCSF_AUTHORIZATION_CLASS_NAME,
		activity_id: activity.id,
		activity_name: activity.name,
		type_uid: OCSF_AUTHORIZATION_CLASS_UID * 100 + activity.id,
		severity_id,
		status: "Success",
		message: `credential ${grant.grantId} ${grant.status}`,
		metadata: {
			version: "1.0.0",
			product: { name: "HoBo Credential OCSF Export", vendor_name: "HoBo" },
		},
		hobo: {
			export_kind: "credential-audit",
			export_version: OCSF_EXPORT_VERSION,
			correlation_id: correlationId,
			credential_chain: chainFor(grant),
		},
	};
}

// Canonicalize + digest the records for a stable integrity seal. Sorting object
// keys makes the digest independent of property insertion order.
function sealFor(records: readonly OcsfAuthorizationRecord[]): string {
	const canonical = JSON.stringify(records, sortedReplacer());
	return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

function sortedReplacer(): (key: string, value: unknown) => unknown {
	return (_key, value) => {
		if (value && typeof value === "object" && !Array.isArray(value)) {
			return Object.fromEntries(
				Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
					a.localeCompare(b),
				),
			);
		}
		return value;
	};
}

// Map a folded CredentialAuditRow to a signed-ready OCSF Authorization batch,
// one record per grant (its terminal lifecycle state), each carrying the full
// credential_chain. Ordering follows the row's timeline monotonicity.
export function credentialAuditToOcsf(row: CredentialAuditRow): OcsfBatch {
	const grants = Object.values(row.grants).sort((a, b) =>
		a.grantId.localeCompare(b.grantId),
	);
	const records = grants.map((grant) => recordFor(row.correlationId, grant));

	let ordering: OcsfBatch["ordering"] = { mode: "ordered" };
	for (let i = 1; i < row.timeline.length; i++) {
		if (row.timeline[i]!.seq <= row.timeline[i - 1]!.seq) {
			ordering = { mode: "unordered", reason: "non-monotonic-seq" };
			break;
		}
	}

	return {
		export_version: OCSF_EXPORT_VERSION,
		correlationId: row.correlationId,
		ordering,
		records,
		sealDigest: sealFor(records),
	};
}
