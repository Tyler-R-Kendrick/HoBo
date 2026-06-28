import { createInBoundaryRegistryMirror, createRegistryImporter } from "../../registry-import-contract/src/registry-import.mjs";
import { parseBundleManifest } from "../../signed-offline-bundle-contract/src/bundle-contract.mjs";

export const OFFLINE_IMPORT_INTEGRITY_CONTRACT = "hobo.offline-import-integrity/v1";

export function createOfflineIntegrityImporter({
  mirror = createInBoundaryRegistryMirror(),
  now = () => new Date().toISOString(),
} = {}) {
  const baseImporter = createRegistryImporter({ mirror, now });

  return Object.freeze({
    importBundle({
      bundle,
      payloads,
      trustBoundary,
      offlineTrust,
      installedState = { artifacts: [] },
      forceDowngrade = null,
    } = {}) {
      const importedAt = now();
      const parsed = parseBundleManifest(bundle);
      if (!parsed.ok) {
        return rejected({
          reasons: parsed.errors.map((error) => `bundle.invalid: ${error}`),
          mirror,
        });
      }

      const gate = evaluateOfflineGates({
        manifest: parsed.manifest,
        payloads,
        offlineTrust,
        installedState,
        forceDowngrade,
        importedAt,
      });

      if (!gate.ok) {
        const event = recordBundleImported({
          mirror,
          manifest: parsed.manifest,
          importedAt,
          status: "Refused",
          verification: gate.verification,
          artifacts: gate.artifacts,
          forceDowngrade: gate.forceDowngrade,
        });

        return Object.freeze({
          ok: false,
          contract: OFFLINE_IMPORT_INTEGRITY_CONTRACT,
          reasons: Object.freeze(gate.reasons),
          artifacts: Object.freeze(gate.artifacts.map(clone)),
          event: clone(event),
          mirror,
        });
      }

      const imported = baseImporter.importBundle({ bundle, payloads, trustBoundary });
      const event = recordBundleImported({
        mirror,
        manifest: parsed.manifest,
        importedAt,
        status: imported.ok ? "Imported" : "Partial",
        verification: {
          signature: imported.event?.verification?.signature ?? "checked",
          provenance: imported.event?.verification?.provenance ?? "checked",
          conformance: imported.event?.verification?.conformance ?? "checked",
          revocation: gate.verification.revocation,
          antiRollback: gate.verification.antiRollback,
          transparency: gate.verification.transparency,
        },
        artifacts: imported.artifacts.map((artifact) => ({
          name: artifact.name,
          version: artifact.version,
          kind: artifact.kind,
          digest: artifact.digest,
          status: artifact.status,
          reasons: artifact.reasons,
        })),
        forceDowngrade: gate.forceDowngrade,
      });

      return Object.freeze({
        ok: imported.ok,
        contract: OFFLINE_IMPORT_INTEGRITY_CONTRACT,
        reasons: imported.reasons,
        artifacts: imported.artifacts,
        event: clone(event),
        mirror,
      });
    },
    mirror,
  });
}

function evaluateOfflineGates({
  manifest,
  payloads,
  offlineTrust,
  installedState,
  forceDowngrade,
  importedAt,
}) {
  const artifacts = [];
  const reasons = [];
  let revocationFailed = false;
  let antiRollbackFailed = false;
  let transparencyFailed = false;
  let forceDowngradeUsed = false;

  for (const listing of manifest.contents.listings) {
    const artifactReasons = [
      ...checkRevocationGate({ manifest, listing, payloads, offlineTrust, importedAt }),
      ...checkAntiRollbackGate({ listing, installedState, forceDowngrade }),
      ...checkTransparencyGate({ manifest, listing, offlineTrust }),
    ];

    if (artifactReasons.some((reason) => reason.startsWith("revocation."))) {
      revocationFailed = true;
    }
    if (artifactReasons.some((reason) => reason.startsWith("antiRollback."))) {
      antiRollbackFailed = true;
    }
    if (artifactReasons.some((reason) => reason.startsWith("transparency."))) {
      transparencyFailed = true;
    }
    if (needsForceDowngrade({ listing, installedState }) && isValidForceDowngrade(forceDowngrade)) {
      forceDowngradeUsed = true;
    }

    const status = artifactReasons.length > 0 ? "refused" : "accepted";
    artifacts.push(Object.freeze({
      name: listing.name,
      version: listing.version,
      kind: listing.kind,
      digest: listing.descriptor.digest,
      status,
      reasons: Object.freeze(artifactReasons),
    }));

    if (artifactReasons.length > 0) {
      reasons.push(`artifact ${listing.name}@${listing.version} refused: ${artifactReasons.join(",")}`);
    }
  }

  return Object.freeze({
    ok: reasons.length === 0,
    reasons: Object.freeze(reasons),
    artifacts: Object.freeze(artifacts),
    verification: Object.freeze({
      revocation: revocationFailed ? "failed" : "passed",
      antiRollback: antiRollbackFailed
        ? "failed"
        : forceDowngradeUsed
          ? "passed-with-force-downgrade"
          : "passed",
      transparency: transparencyFailed ? "failed" : "passed",
    }),
    forceDowngrade: forceDowngradeUsed ? clone(forceDowngrade) : null,
  });
}

function checkRevocationGate({ manifest, listing, payloads, offlineTrust, importedAt }) {
  const revocationList = offlineTrust?.revocationList;
  if (!revocationList) {
    return ["revocation.missing"];
  }

  const reasons = [];
  if (revocationList.refDigest !== manifest.trust.revocationList.ref.digest) {
    reasons.push("revocation.digest_mismatch");
  }
  if (revocationList.signedBy !== manifest.trust.revocationList.signingKeyId) {
    reasons.push("revocation.signer_mismatch");
  }
  if (revocationList.signatureVerified !== true) {
    reasons.push("revocation.signature_invalid");
  }
  if (Date.parse(importedAt) > Date.parse(revocationList.expiresAt)) {
    reasons.push("revocation.expired");
  }

  const keyId = payloadFor(payloads, listing.descriptor.digest)?.candidate?.signature?.keyId;
  if (!keyId) {
    reasons.push("revocation.signing_key_unknown");
  } else if ((revocationList.revokedKeyIds ?? []).includes(keyId)) {
    reasons.push(`revocation.revoked_key:${keyId}`);
  }

  return reasons;
}

function checkAntiRollbackGate({ listing, installedState, forceDowngrade }) {
  const rollback = rollbackFinding({ listing, installedState });
  if (!rollback) {
    return [];
  }
  if (isValidForceDowngrade(forceDowngrade)) {
    return [];
  }
  return [`antiRollback.older_than_installed:${listing.name}@${listing.version}:${rollback}`];
}

function checkTransparencyGate({ manifest, listing, offlineTrust }) {
  const proof = proofFor(offlineTrust?.transparencyProofs, listing.transparency.inclusionProof.digest);
  if (!proof) {
    return [`transparency.inclusion_proof_missing:${listing.transparency.inclusionProof.digest}`];
  }

  const reasons = [];
  if (proof.verified !== true) {
    reasons.push(`transparency.inclusion_proof_invalid:${listing.transparency.inclusionProof.digest}`);
  }
  if (proof.logId !== manifest.trust.transparencyLog.logId) {
    reasons.push("transparency.log_mismatch");
  }
  if (proof.logRoot !== manifest.trust.transparencyLog.pinnedRoot) {
    reasons.push("transparency.root_mismatch");
  }
  if (proof.artifactDigest !== listing.descriptor.digest) {
    reasons.push("transparency.artifact_digest_mismatch");
  }
  return reasons;
}

function needsForceDowngrade({ listing, installedState }) {
  return Boolean(rollbackFinding({ listing, installedState }));
}

function rollbackFinding({ listing, installedState }) {
  const installed = (installedState?.artifacts ?? []).find((artifact) =>
    artifact.name === listing.name
  );
  if (!installed) {
    return null;
  }

  if (installed.buildTimestamp && Date.parse(listing.buildTimestamp) < Date.parse(installed.buildTimestamp)) {
    return "buildTimestamp";
  }
  if (installed.version && compareVersions(listing.version, installed.version) < 0) {
    return "version";
  }
  return null;
}

function isValidForceDowngrade(forceDowngrade) {
  return isNonEmptyString(forceDowngrade?.approvedBy)
    && isNonEmptyString(forceDowngrade?.reason)
    && isNonEmptyString(forceDowngrade?.ticket);
}

function recordBundleImported({
  mirror,
  manifest,
  importedAt,
  status,
  verification,
  artifacts,
  forceDowngrade,
}) {
  const event = {
    type: "registry.BundleImported",
    contract: OFFLINE_IMPORT_INTEGRITY_CONTRACT,
    bundleDigest: manifest.bundleDigest,
    importedAt,
    status,
    verification: clone(verification),
    artifacts: artifacts.map((artifact) => ({
      name: artifact.name,
      version: artifact.version,
      kind: artifact.kind,
      digest: artifact.digest,
      status: artifact.status,
      reasons: artifact.reasons,
    })),
  };
  if (forceDowngrade) {
    event.forceDowngrade = clone(forceDowngrade);
  }
  mirror.recordImportEvent?.(event);
  return Object.freeze(event);
}

function payloadFor(payloads, digest) {
  if (payloads instanceof Map) {
    return payloads.get(digest) ?? null;
  }
  if (payloads && typeof payloads === "object" && !Array.isArray(payloads)) {
    return payloads[digest] ?? null;
  }
  return null;
}

function proofFor(proofs, digest) {
  if (proofs instanceof Map) {
    return proofs.get(digest) ?? null;
  }
  if (proofs && typeof proofs === "object" && !Array.isArray(proofs)) {
    return proofs[digest] ?? null;
  }
  return null;
}

function rejected({ reasons, mirror }) {
  return Object.freeze({
    ok: false,
    contract: OFFLINE_IMPORT_INTEGRITY_CONTRACT,
    reasons: Object.freeze(reasons),
    artifacts: Object.freeze([]),
    event: null,
    mirror,
  });
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function compareVersions(left, right) {
  const leftParts = String(left).split(".");
  const rightParts = String(right).split(".");
  const max = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < max; index += 1) {
    const leftPart = leftParts[index] ?? "0";
    const rightPart = rightParts[index] ?? "0";
    const leftNumber = Number(leftPart);
    const rightNumber = Number(rightPart);

    if (Number.isInteger(leftNumber) && Number.isInteger(rightNumber)) {
      if (leftNumber !== rightNumber) {
        return Math.sign(leftNumber - rightNumber);
      }
      continue;
    }

    const compared = leftPart.localeCompare(rightPart);
    if (compared !== 0) {
      return Math.sign(compared);
    }
  }

  return 0;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
