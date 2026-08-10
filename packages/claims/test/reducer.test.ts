import { describe, expect, it } from "vitest";

import {
	ClaimError,
	attachBundle,
	claimAtomicityOf,
	initialState,
	reduce,
	type ClaimBundle,
	type ClaimCommand,
	type ClaimCoordinatorState,
	type ClaimItem,
	type GuestLease,
} from "../src/index.js";

const FENCE = "fence-1";
const NOW = Date.UTC(2026, 7, 8, 12);

function item(overrides: Partial<ClaimItem> = {}): ClaimItem {
	return {
		id: "item-cf",
		subjectRef: "yard://cloudflare/temp-1",
		subjectKind: "yard",
		providerId: "cloudflare",
		claimStrategyRef: "claim.cloudflare.temporary-account/v1",
		mode: "account-claim",
		deadline: NOW + 60 * 60 * 1000,
		continuity: { endpoint: "preserved", data: "preserved", credentials: "reauthorized" },
		creatorAuthorityAfterClaim: "reauthorization-required",
		verificationRef: "verify.cloudflare.account-ownership/v1",
		postClaimActions: [],
		completedPostClaimActions: [],
		status: "pending",
		...overrides,
	};
}

function bundle(items: readonly ClaimItem[]): ClaimBundle {
	return {
		schemaVersion: "hobo.claim-bundle/v1",
		id: "bundle-1",
		deploymentRef: "deployment-1",
		items,
		dependencyEdges: [],
		atomicity: claimAtomicityOf(items),
		compensation: {
			onTimeout: "destroy",
			onPartialClaim: "continue-and-repair",
			rollbackWindowMs: 3_600_000,
		},
		status: "pending",
	};
}

const lease: GuestLease = {
	schemaVersion: "hobo.guest-lease/v1",
	id: "lease-1",
	subjectRef: "yard://cloudflare/temp-1",
	bootstrapStrategyRef: "bootstrap.cloudflare.temporary-account/v1",
	bootstrapClass: "proof-of-work",
	createdAt: NOW,
	expiresAt: NOW + 60 * 60 * 1000,
	claimBy: NOW + 60 * 60 * 1000,
	renewable: false,
	renewalCount: 0,
	cleanupPolicy: "delete",
	status: "active",
	fencingToken: FENCE,
};

function run(
	state: ClaimCoordinatorState,
	commands: readonly ClaimCommand[],
	fencingToken = FENCE,
): ClaimCoordinatorState {
	return commands.reduce(
		(acc, command) => reduce(acc, command, { fencingToken }).state,
		state,
	);
}

function provisioned(items: readonly ClaimItem[]): ClaimCoordinatorState {
	const base = run(initialState("deployment-1", FENCE), [
		{ kind: "CompileDeploymentOffer", deploymentRef: "deployment-1", offerId: "offer-1" },
		{ kind: "AcceptDeploymentOffer", offerId: "offer-1", offerDigest: "sha256:abc", acceptedAt: NOW },
		{ kind: "ReserveGuestLease", lease },
		{ kind: "StartGuestDeployment", deploymentRef: "deployment-1", idempotencyKey: "k1" },
		{
			kind: "RecordProvisionedSubject",
			subjectRef: "yard://cloudflare/temp-1",
			subjectKind: "yard",
			providerId: "cloudflare",
			idempotencyKey: "k2",
		},
	]);
	return attachBundle(base, bundle(items));
}

describe("offer and provisioning", () => {
	it("cannot start a deployment before the offer is accepted", () => {
		const state = run(initialState("deployment-1", FENCE), [
			{ kind: "CompileDeploymentOffer", deploymentRef: "deployment-1", offerId: "offer-1" },
		]);
		expect(() =>
			reduce(
				state,
				{ kind: "StartGuestDeployment", deploymentRef: "deployment-1", idempotencyKey: "k1" },
				{ fencingToken: FENCE },
			),
		).toThrow(/offer must be accepted/u);
	});

	it("treats a duplicate provisioning request as the same subject", () => {
		const state = provisioned([item()]);
		const again = reduce(
			state,
			{
				kind: "RecordProvisionedSubject",
				subjectRef: "yard://cloudflare/temp-1",
				subjectKind: "yard",
				providerId: "cloudflare",
				idempotencyKey: "k2",
			},
			{ fencingToken: FENCE },
		);
		expect(again.state.provisionedSubjects).toEqual(["yard://cloudflare/temp-1"]);
		expect(again.events).toEqual([]);
	});

	it("rejects a stale fence", () => {
		const state = provisioned([item()]);
		expect(() =>
			reduce(state, { kind: "BeginClaimItem", itemId: "item-cf", at: NOW }, {
				fencingToken: "fence-old",
			}),
		).toThrow(/fencing token/u);
	});
});

describe("verification gates completion", () => {
	it("does not complete a claim on a provider callback alone", () => {
		const state = run(provisioned([item()]), [
			{ kind: "BeginClaimBundle", bundleId: "bundle-1", at: NOW },
			{ kind: "BeginClaimItem", itemId: "item-cf", at: NOW },
			{ kind: "ObserveClaimItem", itemId: "item-cf", observedStatus: "claimed", at: NOW },
		]);
		expect(state.bundle?.items[0]?.status).toBe("observed");
		expect(() =>
			reduce(state, { kind: "CompleteClaimItem", itemId: "item-cf", at: NOW }, {
				fencingToken: FENCE,
			}),
		).toThrow(/independently verified/u);
	});

	it("completes after independent verification with no outstanding obligations", () => {
		const state = run(provisioned([item()]), [
			{ kind: "BeginClaimBundle", bundleId: "bundle-1", at: NOW },
			{ kind: "BeginClaimItem", itemId: "item-cf", at: NOW },
			{ kind: "ObserveClaimItem", itemId: "item-cf", observedStatus: "claimed", at: NOW },
			{
				kind: "VerifyOwnership",
				itemId: "item-cf",
				verified: true,
				evidenceRef: "evidence-1",
				creatorAuthorityAfterClaim: "reauthorization-required",
			},
			{ kind: "CompleteClaimItem", itemId: "item-cf", at: NOW },
			{ kind: "CompleteClaimBundle", bundleId: "bundle-1", at: NOW },
		]);
		expect(state.bundle?.status).toBe("complete");
		expect(state.lifecycle).toBe("OwnerControlled");
	});

	it("blocks completion while a binding rotation is owed", () => {
		const withRotation = item({ postClaimActions: ["rotate-binding"] });
		const state = run(provisioned([withRotation]), [
			{ kind: "BeginClaimItem", itemId: "item-cf", at: NOW },
			{
				kind: "VerifyOwnership",
				itemId: "item-cf",
				verified: true,
				evidenceRef: "evidence-1",
				creatorAuthorityAfterClaim: "rotatable",
			},
		]);
		expect(state.bundle?.items[0]?.status).toBe("needs-rotation");
		expect(state.lifecycle).toBe("ClaimedNeedsRotation");
		const error = (() => {
			try {
				reduce(state, { kind: "CompleteClaimItem", itemId: "item-cf", at: NOW }, {
					fencingToken: FENCE,
				});
				return undefined;
			} catch (caught) {
				return caught as ClaimError;
			}
		})();
		expect(error?.code).toBe("BINDING_ROTATION_REQUIRED");
	});

	it("blocks completion while bootstrap authority remains", () => {
		const withRevocation = item({ postClaimActions: ["revoke-bootstrap-authority"] });
		const state = run(provisioned([withRevocation]), [
			{
				kind: "VerifyOwnership",
				itemId: "item-cf",
				verified: true,
				evidenceRef: "e",
				creatorAuthorityAfterClaim: "retained",
			},
		]);
		const error = (() => {
			try {
				reduce(state, { kind: "CompleteClaimItem", itemId: "item-cf", at: NOW }, {
					fencingToken: FENCE,
				});
				return undefined;
			} catch (caught) {
				return caught as ClaimError;
			}
		})();
		expect(error?.code).toBe("BOOTSTRAP_AUTHORITY_REMAINS");
	});

	it("clears creator authority once bootstrap authority is revoked", () => {
		const withRevocation = item({ postClaimActions: ["revoke-bootstrap-authority"] });
		const state = run(provisioned([withRevocation]), [
			{
				kind: "VerifyOwnership",
				itemId: "item-cf",
				verified: true,
				evidenceRef: "e",
				creatorAuthorityAfterClaim: "retained",
			},
			{ kind: "RevokeBootstrapAuthority", itemId: "item-cf", evidenceRef: "revoked-1" },
			{ kind: "CompleteClaimItem", itemId: "item-cf", at: NOW },
		]);
		expect(state.bundle?.items[0]?.creatorAuthorityAfterClaim).toBe("absent");
		expect(state.bundle?.items[0]?.status).toBe("completed");
	});

	it("marks a failed verification repairable rather than failed", () => {
		const state = run(provisioned([item()]), [
			{
				kind: "VerifyOwnership",
				itemId: "item-cf",
				verified: false,
				evidenceRef: "e",
				creatorAuthorityAfterClaim: "unknown",
			},
		]);
		expect(state.bundle?.items[0]?.status).toBe("repairable-failure");
		expect(state.bundle?.status).toBe("claimed-needs-remediation");
		expect(state.lifecycle).toBe("RepairableFailure");
	});

	it("retries a repairable item back into progress", () => {
		const state = run(provisioned([item()]), [
			{
				kind: "VerifyOwnership",
				itemId: "item-cf",
				verified: false,
				evidenceRef: "e",
				creatorAuthorityAfterClaim: "unknown",
			},
			{ kind: "RetryRepairableClaim", itemId: "item-cf", at: NOW },
		]);
		expect(state.bundle?.items[0]?.status).toBe("in-progress");
		expect(state.bundle?.items[0]?.failureCode).toBeUndefined();
	});
});

describe("multi-provider bundles", () => {
	const cloudflare = item({ id: "item-cf", providerId: "cloudflare" });
	const neon = item({
		id: "item-neon",
		providerId: "neon",
		subjectRef: "resource://neon/db-1",
		subjectKind: "resource",
		mode: "resource-claim",
		deadline: NOW + 72 * 60 * 60 * 1000,
		creatorAuthorityAfterClaim: "rotatable",
	});

	it("classifies two providers as a best-effort saga", () => {
		expect(claimAtomicityOf([cloudflare, neon])).toBe("best-effort-saga");
	});

	it("classifies one provider with two items as provider-bundled", () => {
		expect(
			claimAtomicityOf([cloudflare, { ...neon, providerId: "cloudflare" }]),
		).toBe("provider-bundled");
	});

	it("derives the earliest deadline across open items", () => {
		const state = provisioned([cloudflare, neon]);
		expect(state.bundle?.earliestDeadline).toBe(cloudflare.deadline);
	});

	it("recomputes the earliest deadline as items complete", () => {
		const state = run(provisioned([cloudflare, neon]), [
			{
				kind: "VerifyOwnership",
				itemId: "item-cf",
				verified: true,
				evidenceRef: "e",
				creatorAuthorityAfterClaim: "absent",
			},
			{ kind: "CompleteClaimItem", itemId: "item-cf", at: NOW },
		]);
		expect(state.bundle?.earliestDeadline).toBe(neon.deadline);
	});

	it("reports one claimed and one expired subject as partially claimed", () => {
		const state = run(provisioned([cloudflare, neon]), [
			{
				kind: "VerifyOwnership",
				itemId: "item-cf",
				verified: true,
				evidenceRef: "e",
				creatorAuthorityAfterClaim: "absent",
			},
			{ kind: "CompleteClaimItem", itemId: "item-cf", at: NOW },
			{ kind: "ObserveClaimItem", itemId: "item-neon", observedStatus: "expired", at: NOW },
		]);
		expect(state.bundle?.status).toBe("partially-claimed");
		expect(state.lifecycle).toBe("RepairableFailure");
	});

	it("refuses to report a partially claimed bundle as complete", () => {
		const state = run(provisioned([cloudflare, neon]), [
			{
				kind: "VerifyOwnership",
				itemId: "item-cf",
				verified: true,
				evidenceRef: "e",
				creatorAuthorityAfterClaim: "absent",
			},
			{ kind: "CompleteClaimItem", itemId: "item-cf", at: NOW },
		]);
		const error = (() => {
			try {
				reduce(state, { kind: "CompleteClaimBundle", bundleId: "bundle-1", at: NOW }, {
					fencingToken: FENCE,
				});
				return undefined;
			} catch (caught) {
				return caught as ClaimError;
			}
		})();
		expect(error?.code).toBe("CLAIM_PARTIALLY_COMPLETED");
	});
});

describe("independent identity planes", () => {
	it("lets the human own the infrastructure while the agent stays revoked", () => {
		const withAgent = item({ postClaimActions: ["reauthorize-agent"] });
		const state = run(provisioned([withAgent]), [
			{
				kind: "VerifyOwnership",
				itemId: "item-cf",
				verified: true,
				evidenceRef: "e",
				creatorAuthorityAfterClaim: "absent",
			},
			{ kind: "AuthorizePostClaimAgent", itemId: "item-cf", granted: false },
		]);
		expect(state.agentAuthorized).toBe(false);
		// The obligation is still outstanding, so the item cannot silently close.
		expect(() =>
			reduce(state, { kind: "CompleteClaimItem", itemId: "item-cf", at: NOW }, {
				fencingToken: FENCE,
			}),
		).toThrow();
	});

	it("reaches owner-and-agent control only after explicit authorization", () => {
		const withAgent = item({ postClaimActions: ["reauthorize-agent"] });
		const state = run(provisioned([withAgent]), [
			{
				kind: "VerifyOwnership",
				itemId: "item-cf",
				verified: true,
				evidenceRef: "e",
				creatorAuthorityAfterClaim: "absent",
			},
			{ kind: "AuthorizePostClaimAgent", itemId: "item-cf", granted: true },
			{ kind: "CompleteClaimItem", itemId: "item-cf", at: NOW },
			{ kind: "CompleteClaimBundle", bundleId: "bundle-1", at: NOW },
		]);
		expect(state.lifecycle).toBe("OwnerAndAgentControlled");
	});
});

describe("migration cutover", () => {
	it("refuses connector cutover before the destination is verified", () => {
		const state = run(provisioned([item({ postClaimActions: ["migrate-data"] })]), [
			{ kind: "BeginResourceMigration", itemId: "item-cf", migrationProfileRef: "migration.convex.snapshot/v1" },
		]);
		const error = (() => {
			try {
				reduce(
					state,
					{ kind: "CommitConnectorCutover", itemId: "item-cf", connectorRef: "connector-1" },
					{ fencingToken: FENCE },
				);
				return undefined;
			} catch (caught) {
				return caught as ClaimError;
			}
		})();
		expect(error?.code).toBe("MIGRATION_VERIFICATION_FAILED");
	});

	it("commits cutover once the destination is verified", () => {
		const state = run(provisioned([item({ postClaimActions: ["migrate-data"] })]), [
			{
				kind: "VerifyOwnership",
				itemId: "item-cf",
				verified: true,
				evidenceRef: "e",
				creatorAuthorityAfterClaim: "absent",
			},
			{ kind: "CommitConnectorCutover", itemId: "item-cf", connectorRef: "connector-1" },
			{ kind: "CompleteClaimItem", itemId: "item-cf", at: NOW },
		]);
		expect(state.bundle?.items[0]?.status).toBe("completed");
	});
});

describe("expiry", () => {
	it("expires an unclaimed deployment", () => {
		const state = run(provisioned([item()]), [
			{ kind: "ExpireGuestLease", leaseId: "lease-1", at: NOW + 7_200_000 },
		]);
		expect(state.lifecycle).toBe("Expired");
		expect(state.lease?.status).toBe("expired");
	});

	it("does not disturb work the human already owns", () => {
		const owned = run(provisioned([item()]), [
			{
				kind: "VerifyOwnership",
				itemId: "item-cf",
				verified: true,
				evidenceRef: "e",
				creatorAuthorityAfterClaim: "absent",
			},
			{ kind: "CompleteClaimItem", itemId: "item-cf", at: NOW },
			{ kind: "CompleteClaimBundle", bundleId: "bundle-1", at: NOW },
			{ kind: "ExpireGuestLease", leaseId: "lease-1", at: NOW + 7_200_000 },
		]);
		expect(owned.lifecycle).toBe("OwnerControlled");
	});
});

describe("restart safety", () => {
	it("replays to the same state from the same command sequence", () => {
		const commands: readonly ClaimCommand[] = [
			{ kind: "BeginClaimBundle", bundleId: "bundle-1", at: NOW },
			{ kind: "BeginClaimItem", itemId: "item-cf", at: NOW },
			{ kind: "ObserveClaimItem", itemId: "item-cf", observedStatus: "claimed", at: NOW },
			{
				kind: "VerifyOwnership",
				itemId: "item-cf",
				verified: true,
				evidenceRef: "e",
				creatorAuthorityAfterClaim: "absent",
			},
		];
		const a = run(provisioned([item()]), commands);
		const b = run(provisioned([item()]), commands);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	it("is idempotent when a command is redelivered", () => {
		const once = run(provisioned([item()]), [
			{ kind: "BeginClaimItem", itemId: "item-cf", at: NOW },
		]);
		const twice = run(once, [{ kind: "BeginClaimItem", itemId: "item-cf", at: NOW }]);
		expect(JSON.stringify(twice.bundle)).toBe(JSON.stringify(once.bundle));
	});
});
