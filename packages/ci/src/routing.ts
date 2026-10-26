import { createDispatcherRegistry, decideDispatch } from "@hobo/dispatcher";
import type { Account, Lease, Offer } from "./_generated/ci_pb.js";

export const ACTIVE_STATES = new Set([
	"reserved",
	"dispatching",
	"dispatched",
	"claiming",
	"running",
	"uncertain",
]);

/** Pure ranking input; availability is measured per customer-owned account. */
export function route(account: Account, leases: readonly Lease[], now: string) {
	const active = leases.filter(
		(lease) => lease.accountId === account.id && ACTIVE_STATES.has(lease.state),
	);
	const settled = leases.filter(
		(lease) => lease.accountId === account.id && lease.state === "completed",
	);
	const minutes = account.maxRuntimeMinutes + account.startupMinutes;
	const held = active.reduce((sum, lease) => sum + lease.reservedPaidMicros, 0);
	const spent =
		account.spentMicros +
		settled.reduce((sum, lease) => sum + lease.paidMicros, 0);
	const candidates = account.offers.flatMap((offer) => {
		if (
			!offer.enabled ||
			!offer.bridgeAcknowledged ||
			Date.parse(offer.observedAt) > Date.parse(now) ||
			Date.parse(offer.validUntil) <= Date.parse(now)
		)
			return [];
		const reserved = active.filter((lease) => lease.offerId === offer.id);
		if (reserved.length >= offer.concurrency) return [];
		const used = settled.filter((lease) => lease.offerId === offer.id);
		const usedFree = used
			.filter(
				(lease) => Date.parse(lease.settledAt) >= Date.parse(offer.observedAt),
			)
			.reduce((sum, lease) => sum + lease.billedFreeMinutes, 0);
		const free =
			Date.parse(offer.validUntil) < Date.parse(now) + minutes * 60000
				? 0
				: Math.max(
						0,
						offer.freeMinutes -
							usedFree -
							reserved.reduce(
								(sum, lease) => sum + lease.reservedFreeMinutes,
								0,
							),
					);
		const reservedFree = Math.min(free, minutes);
		const paid = Math.ceil(
			(minutes - reservedFree) * offer.priceMicrosPerMinute,
		);
		const providerSpent =
			offer.spentMicros +
			used.reduce((sum, lease) => sum + lease.paidMicros, 0) +
			reserved.reduce((sum, lease) => sum + lease.reservedPaidMicros, 0);
		if (
			spent + held + paid > account.budgetMicros ||
			providerSpent + paid > offer.budgetMicros
		)
			return [];
		return [{ offer, free, reservedFree, paid }];
	});
	// Consume remaining usable free allocations before comparing paid prices.
	// Jobs cannot be split between machines; reserve enough for the entire host.
	const freeCandidates = candidates.filter((candidate) => candidate.free > 0);
	const eligible = freeCandidates.length > 0 ? freeCandidates : candidates;
	if (eligible.length === 0) return undefined;
	const decision = decideDispatch({
		category: "runner",
		dispatchId: "ci-route",
		units: minutes,
		registry: createDispatcherRegistry(
			eligible.map((candidate) => ({
				providerId: candidate.offer.id,
				category: "runner",
				listUnitCost: candidate.offer.priceMicrosPerMinute,
			})),
		),
		ledgerView: {
			view: "CreditLedgerView",
			seq: 0,
			accounts: eligible.map((candidate) => ({
				providerId: candidate.offer.id,
				dimension: "runner.minutes",
				freeHeadroom: candidate.free,
				listUnitCost: candidate.offer.priceMicrosPerMinute,
				concurrencyHeadroom: 1,
			})),
		},
	});
	if (!decision.ok) return undefined;
	const selected = eligible.find(
		(candidate) => candidate.offer.id === decision.selectedProvider,
	);
	if (!selected) throw new Error("dispatcher selected an unregistered offer");
	return {
		offer: selected.offer,
		minutes,
		freeMinutes: selected.reservedFree,
		paidMicros: selected.paid,
		decision: decision.dispatchEvent,
	};
}

export function providerOffer(account: Account, lease: Lease): Offer {
	const offer = account.offers.find(
		(candidate) => candidate.id === lease.offerId,
	);
	if (!offer) throw new Error("lease offer missing from configuration");
	return offer;
}
