import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ATTESTATION_SCHEMA_VERSION = "hobo.workload-attestation/v1";

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PRINCIPAL_KINDS = new Set(["user", "agent", "service", "workload"]);

export type PrincipalRef = Readonly<{
	kind: string;
	id: string;
}>;

export type LaunchMeasurement = Readonly<{
	runId: string;
	tenant: string;
	parentPrincipal: PrincipalRef;
	codeVersion: Readonly<{ digest: string; version: string }>;
	componentImageDigest: string;
	hostId: string;
	issuedAt: string;
	expiresAt: string;
	nonce: string;
	isolationTier: string;
}>;

export type AttestationDocument = Readonly<{
	schemaVersion: string;
	runId: string;
	claimed: Readonly<Record<string, unknown>>;
	launchMeasurement: LaunchMeasurement;
	hostSignature: Readonly<{
		algorithm: string;
		hostId: string;
		keyId: string;
		value: string;
	}>;
}>;

export type AttestationVerdict =
	| Readonly<{
			state: "attested";
			reason: string;
			binding: Readonly<{
				runId: string;
				tenant: string;
				parentPrincipal: PrincipalRef;
				codeVersion: Readonly<{ digest: string; version: string }>;
				componentImageDigest: string;
			}>;
			claimConflict?: Readonly<{
				field: string;
				claimed: unknown;
				measured: unknown;
			}>;
	  }>
	| Readonly<{
			state: "unattested";
			reason: string;
	  }>;

export function createFixtureHostAttestor(options: {
	hostId: string;
	keyId?: string;
}) {
	const hostId = options.hostId;
	const keyId = options.keyId ?? `${hostId}-key-1`;
	const verificationKey = `fixture-host-key:${hostId}:${keyId}`;

	return {
		createDocument(input: {
			launchMeasurement: LaunchMeasurement;
			claimed?: Readonly<Record<string, unknown>>;
		}): AttestationDocument {
			const measured = { ...input.launchMeasurement };
			return {
				schemaVersion: ATTESTATION_SCHEMA_VERSION,
				runId: measured.runId,
				claimed: input.claimed ?? {},
				launchMeasurement: measured,
				hostSignature: {
					algorithm: "fixture-hmac-sha256",
					hostId,
					keyId,
					value: signLaunchMeasurement(measured, verificationKey),
				},
			};
		},
		publicKeys() {
			return [{ hostId, keyId, verificationKey }];
		},
	};
}

export function verifyWorkloadAttestation(
	document: unknown,
	options: {
		knownImageDigests?: readonly string[];
		hostPublicKeys?: readonly {
			hostId: string;
			keyId: string;
			verificationKey: string;
		}[];
		now?: string;
	} = {},
): AttestationVerdict {
	const fail = (reason: string): AttestationVerdict => ({
		state: "unattested",
		reason,
	});

	if (!isPlainObject(document)) {
		return fail("attestation-document-invalid");
	}
	if (document.schemaVersion !== ATTESTATION_SCHEMA_VERSION) {
		return fail("attestation-document-invalid");
	}
	if (!isPlainObject(document.launchMeasurement)) {
		return fail("launch-measurement-invalid");
	}

	const measurement = document.launchMeasurement as LaunchMeasurement;
	const measurementError = validateLaunchMeasurement(measurement);
	if (measurementError) {
		return fail(measurementError);
	}
	if (document.runId !== measurement.runId) {
		return fail("run-id-mismatch");
	}
	if (!document.hostSignature) {
		return fail("host-signature-missing");
	}
	if (
		!verifyHostSignature(
			measurement,
			document.hostSignature as AttestationDocument["hostSignature"],
			options.hostPublicKeys ?? [],
		)
	) {
		return fail("host-signature-invalid");
	}

	const nowMs = Date.parse(options.now ?? new Date().toISOString());
	if (Date.parse(measurement.issuedAt) > nowMs) {
		return fail("launch-measurement-not-yet-valid");
	}
	if (Date.parse(measurement.expiresAt) <= nowMs) {
		return fail("launch-measurement-expired");
	}

	const knownDigests = new Set(options.knownImageDigests ?? []);
	if (!knownDigests.has(measurement.componentImageDigest)) {
		return fail("unknown-component-image");
	}

	const verdict: AttestationVerdict = {
		state: "attested",
		reason: "host-signature-valid",
		binding: {
			runId: measurement.runId,
			tenant: measurement.tenant,
			parentPrincipal: { ...measurement.parentPrincipal },
			codeVersion: { ...measurement.codeVersion },
			componentImageDigest: measurement.componentImageDigest,
		},
	};

	const claimConflict = detectClaimConflict(
		document.claimed as Record<string, unknown>,
		measurement,
	);
	if (claimConflict) {
		return { ...verdict, claimConflict };
	}

	return verdict;
}

function verifyHostSignature(
	measurement: LaunchMeasurement,
	signature: AttestationDocument["hostSignature"],
	hostPublicKeys: readonly {
		hostId: string;
		keyId: string;
		verificationKey: string;
	}[],
): boolean {
	if (
		!isPlainObject(signature) ||
		signature.algorithm !== "fixture-hmac-sha256"
	) {
		return false;
	}
	const key = hostPublicKeys.find(
		(candidate) =>
			candidate.hostId === signature.hostId &&
			candidate.keyId === signature.keyId,
	);
	if (!key) {
		return false;
	}
	const expected = signLaunchMeasurement(measurement, key.verificationKey);
	const actual = Buffer.from(signature.value, "hex");
	const expectedBuffer = Buffer.from(expected, "hex");
	if (actual.length !== expectedBuffer.length) {
		return false;
	}
	return timingSafeEqual(actual, expectedBuffer);
}

function signLaunchMeasurement(
	measurement: LaunchMeasurement,
	verificationKey: string,
): string {
	return createHmac("sha256", verificationKey)
		.update(digestCanonical(measurement))
		.digest("hex");
}

function digestCanonical(measurement: LaunchMeasurement): string {
	const canonical = JSON.stringify({
		runId: measurement.runId,
		tenant: measurement.tenant,
		parentPrincipal: measurement.parentPrincipal,
		codeVersion: measurement.codeVersion,
		componentImageDigest: measurement.componentImageDigest,
		hostId: measurement.hostId,
		issuedAt: measurement.issuedAt,
		expiresAt: measurement.expiresAt,
		nonce: measurement.nonce,
		isolationTier: measurement.isolationTier,
	});
	return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

function validateLaunchMeasurement(
	measurement: LaunchMeasurement,
): string | null {
	if (!measurement.runId) return "launch-measurement-invalid";
	if (!measurement.tenant) return "launch-measurement-invalid";
	if (!isPrincipal(measurement.parentPrincipal))
		return "parent-principal-invalid";
	if (
		!measurement.codeVersion?.digest ||
		!DIGEST_PATTERN.test(measurement.codeVersion.digest)
	) {
		return "code-version-invalid";
	}
	if (!DIGEST_PATTERN.test(measurement.componentImageDigest))
		return "component-image-digest-invalid";
	if (!measurement.hostId) return "launch-measurement-invalid";
	if (
		!ISO_PATTERN.test(measurement.issuedAt) ||
		!ISO_PATTERN.test(measurement.expiresAt)
	) {
		return "launch-measurement-timestamp-invalid";
	}
	if (!measurement.nonce) return "launch-measurement-invalid";
	if (!measurement.isolationTier) return "launch-measurement-invalid";
	return null;
}

function detectClaimConflict(
	claimed: Record<string, unknown>,
	measurement: LaunchMeasurement,
): { field: string; claimed: unknown; measured: unknown } | undefined {
	if (claimed.tenant !== undefined && claimed.tenant !== measurement.tenant) {
		return {
			field: "tenant",
			claimed: claimed.tenant,
			measured: measurement.tenant,
		};
	}
	return undefined;
}

function isPrincipal(value: unknown): value is PrincipalRef {
	return (
		isPlainObject(value) &&
		typeof value.kind === "string" &&
		PRINCIPAL_KINDS.has(value.kind) &&
		typeof value.id === "string"
	);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
