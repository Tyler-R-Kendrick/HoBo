/**
 * Legal-jurisdiction vocabulary + residency evaluation (ADR-0146).
 *
 * Regions are provider facts (free tokens in capability manifests);
 * jurisdictions are legal facts; this module owns the typed join and the
 * pure, deterministic evaluator that turns "constraint + target region" into
 * an explicit verdict. It produces the `residencyConflict` inputs that
 * `can-trail` / `can-migrate` already consume and the `residency` gate reason
 * Gatekeeper reports. Open-spec anchors for the seed vocabulary: GDPR
 * territorial scope + EU adequacy decisions, the EEA, FedRAMP's US federal
 * boundary, and provider sovereignty controls (e.g. Cloudflare's
 * `jurisdiction: "eu" | "fedramp"` knob) — cited as legalBasis strings, never
 * depended on (ADR-0144 posture).
 */

// domain-view: parse-time vocabulary; wire form in data-models/jurisdiction.proto.
export type JurisdictionId =
	| "eu"
	| "eea"
	| "us"
	| "us-gov"
	| "uk"
	| "ch"
	| "ca"
	| "au"
	| "in"
	| "jp"
	| "br"
	| "global";

/** Data-classification labels (governance-planes Plan 46), now typed. */
export type DataClassification =
	| "public"
	| "internal"
	| "pii"
	| "phi"
	| "pci"
	| "secret";

// domain-view: parse-time catalog entry; wire form is JurisdictionRecord in data-models/jurisdiction.proto (_generated/jurisdiction_pb.ts).
export interface JurisdictionRecord {
	readonly id: JurisdictionId;
	readonly name: string;
	/** Citations (spec/program names), informational — never a dependency. */
	readonly legalBasis: readonly string[];
}

export interface ResidencyConstraint {
	/** Classifications the constraint applies to; empty = all data. */
	readonly classifications: readonly DataClassification[];
	readonly allowedJurisdictions: readonly JurisdictionId[];
	readonly deniedJurisdictions?: readonly JurisdictionId[];
}

export type ResidencyEvaluation =
	| {
			readonly ok: true;
			readonly region: string;
			readonly regionJurisdictions: readonly JurisdictionId[];
	  }
	| {
			readonly ok: false;
			readonly code:
				| "region-unmapped"
				| "jurisdiction-denied"
				| "jurisdiction-not-allowed";
			readonly region: string;
			readonly regionJurisdictions: readonly JurisdictionId[];
			readonly remediation: string;
	  };

export class JurisdictionParseError extends TypeError {
	constructor(message: string) {
		super(message);
		this.name = "JurisdictionParseError";
	}
}

const JURISDICTION_IDS = new Set<JurisdictionId>([
	"eu",
	"eea",
	"us",
	"us-gov",
	"uk",
	"ch",
	"ca",
	"au",
	"in",
	"jp",
	"br",
	"global",
]);

const CLASSIFICATIONS = new Set<DataClassification>([
	"public",
	"internal",
	"pii",
	"phi",
	"pci",
	"secret",
]);

export function parseJurisdictionId(value: unknown): JurisdictionId {
	if (
		typeof value !== "string" ||
		!JURISDICTION_IDS.has(value as JurisdictionId)
	) {
		throw new JurisdictionParseError(
			`unknown jurisdiction id: ${String(value)}`,
		);
	}
	return value as JurisdictionId;
}

export function parseDataClassification(value: unknown): DataClassification {
	if (
		typeof value !== "string" ||
		!CLASSIFICATIONS.has(value as DataClassification)
	) {
		throw new JurisdictionParseError(
			`unknown data classification: ${String(value)}`,
		);
	}
	return value as DataClassification;
}

export function parseResidencyConstraint(value: unknown): ResidencyConstraint {
	if (typeof value !== "object" || value === null) {
		throw new JurisdictionParseError("residency constraint must be an object");
	}
	const input = value as Record<string, unknown>;
	const classifications = Array.isArray(input.classifications)
		? input.classifications.map(parseDataClassification)
		: [];
	if (!Array.isArray(input.allowedJurisdictions)) {
		throw new JurisdictionParseError(
			"allowedJurisdictions must be an array of jurisdiction ids",
		);
	}
	const allowed = input.allowedJurisdictions.map(parseJurisdictionId);
	if (allowed.length === 0) {
		throw new JurisdictionParseError(
			"allowedJurisdictions must be non-empty (an empty allow-list would deny everything silently)",
		);
	}
	const denied = Array.isArray(input.deniedJurisdictions)
		? input.deniedJurisdictions.map(parseJurisdictionId)
		: undefined;
	return Object.freeze({
		classifications: Object.freeze(classifications),
		allowedJurisdictions: Object.freeze(allowed),
		...(denied !== undefined
			? { deniedJurisdictions: Object.freeze(denied) }
			: {}),
	});
}

/** Seed jurisdiction catalog with informational legal-basis citations. */
export const JURISDICTIONS: readonly JurisdictionRecord[] = Object.freeze(
	(
		[
			{
				id: "eu",
				name: "European Union",
				legalBasis: ["GDPR (Reg. 2016/679)"],
			},
			{
				id: "eea",
				name: "European Economic Area",
				legalBasis: [
					"GDPR territorial scope incl. EEA Joint Committee decisions",
				],
			},
			{
				id: "us",
				name: "United States",
				legalBasis: ["sectoral (HIPAA, GLBA, CCPA/CPRA)"],
			},
			{
				id: "us-gov",
				name: "United States federal boundary",
				legalBasis: ["FedRAMP", "ITAR-adjacent hosting programs"],
			},
			{
				id: "uk",
				name: "United Kingdom",
				legalBasis: ["UK GDPR + DPA 2018", "EU adequacy decision (2021)"],
			},
			{
				id: "ch",
				name: "Switzerland",
				legalBasis: ["revFADP", "EU adequacy decision"],
			},
			{
				id: "ca",
				name: "Canada",
				legalBasis: ["PIPEDA", "EU adequacy (commercial orgs)"],
			},
			{ id: "au", name: "Australia", legalBasis: ["Privacy Act 1988 / APPs"] },
			{ id: "in", name: "India", legalBasis: ["DPDP Act 2023"] },
			{ id: "jp", name: "Japan", legalBasis: ["APPI", "EU adequacy decision"] },
			{ id: "br", name: "Brazil", legalBasis: ["LGPD"] },
			{ id: "global", name: "No jurisdiction constraint", legalBasis: [] },
		] as const
	).map((entry) =>
		Object.freeze({
			...entry,
			legalBasis: Object.freeze([...entry.legalBasis]),
		}),
	),
);

/**
 * Region-token → jurisdictions seed map. Region tokens are the ones providers
 * actually publish today (aws/gcp style, coarse doc tokens, cloudflare colos
 * modeled as `global`, and the local/dev token). Membership is deliberately
 * conservative: an EU region is `["eu", "eea"]`; a UK region is only `["uk"]`.
 * `local` maps to `global` (self-host: the operator's own premises are their
 * own legal problem — HoBo does not guess).
 */
export const REGION_JURISDICTIONS: Readonly<
	Record<string, readonly JurisdictionId[]>
> = Object.freeze({
	// aws-style
	"us-east-1": ["us"],
	"us-west-2": ["us"],
	"eu-west-1": ["eu", "eea"],
	"eu-central-1": ["eu", "eea"],
	// gcp-style
	"us-central1": ["us"],
	"us-east1": ["us"],
	"europe-west1": ["eu", "eea"],
	// coarse doc tokens
	us: ["us"],
	"us-east": ["us"],
	"eu-west": ["eu", "eea"],
	eu: ["eu", "eea"],
	"ap-south": ["in"],
	uk: ["uk"],
	// sovereign/federal
	"us-gov-west-1": ["us", "us-gov"],
	// provider-neutral
	global: ["global"],
	local: ["global"],
});

function normalizeRegion(region: string): string {
	return region.trim().toLowerCase();
}

/** Jurisdictions a region token sits in, or empty when unmapped. */
export function jurisdictionsForRegion(
	region: string,
	catalog: Readonly<
		Record<string, readonly JurisdictionId[]>
	> = REGION_JURISDICTIONS,
): readonly JurisdictionId[] {
	return catalog[normalizeRegion(region)] ?? Object.freeze([]);
}

/**
 * Pure, deterministic residency evaluation. Fail-closed: an unmapped region
 * is a conflict, never a pass — geography the platform cannot attest is
 * geography the constraint cannot allow.
 */
export function evaluateResidency(input: {
	readonly constraint: ResidencyConstraint;
	readonly region: string;
	readonly catalog?: Readonly<Record<string, readonly JurisdictionId[]>>;
}): ResidencyEvaluation {
	const region = normalizeRegion(input.region);
	const regionJurisdictions = jurisdictionsForRegion(region, input.catalog);
	if (regionJurisdictions.length === 0) {
		return Object.freeze({
			ok: false,
			code: "region-unmapped" as const,
			region,
			regionJurisdictions,
			remediation: `region "${region}" has no jurisdiction mapping; add it to the catalog or choose a mapped region`,
		});
	}
	const denied = input.constraint.deniedJurisdictions ?? [];
	const deniedHit = regionJurisdictions.find((entry) => denied.includes(entry));
	if (deniedHit !== undefined) {
		return Object.freeze({
			ok: false,
			code: "jurisdiction-denied" as const,
			region,
			regionJurisdictions,
			remediation: `region "${region}" sits in denied jurisdiction "${deniedHit}"`,
		});
	}
	const allowed = input.constraint.allowedJurisdictions;
	const allowedHit =
		allowed.includes("global") ||
		regionJurisdictions.some((entry) => allowed.includes(entry));
	if (!allowedHit) {
		return Object.freeze({
			ok: false,
			code: "jurisdiction-not-allowed" as const,
			region,
			regionJurisdictions,
			remediation: `region "${region}" (${regionJurisdictions.join(", ")}) is outside allowed jurisdictions [${allowed.join(", ")}]`,
		});
	}
	return Object.freeze({ ok: true, region, regionJurisdictions });
}
