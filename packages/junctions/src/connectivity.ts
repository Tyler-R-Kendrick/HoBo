import { deriveFederationPlan } from "./federation.js";
import { deepFreeze } from "./freeze.js";
import {
	CONNECTIVITY_TIER_LEVELS,
	type ConnectivityHalf,
	type ConnectivityTierName,
	type DnsRecord,
	JUNCTION_CONTRACT_VERSION,
	JUNCTION_PLAN_DERIVED_EVENT,
	type JunctionConnectivityPlan,
	type JunctionDefinition,
	type JunctionMemberManifest,
	JunctionParseError,
	type PeeringEdge,
	type YardConnectivityHalfPlan,
} from "./types.js";

/**
 * Select the connectivity tier for one member pair. Selection is driven only
 * by what the two manifests declare — never widened beyond it:
 *
 * - same provider, same declared region  -> private-network (tier 1)
 * - same provider, different regions     -> cross-region (tier 2)
 * - different providers, both declaring
 *   private-interconnect                 -> private-interconnect (tier 3)
 * - different providers                  -> overlay-mesh (tier 4)
 * - anything else (undeclared regions,
 *   restricted capabilities)             -> public-mtls (tier 5)
 */
export function selectConnectivityTier(
	left: JunctionMemberManifest,
	right: JunctionMemberManifest,
): ConnectivityTierName {
	if (
		left.providerId === right.providerId &&
		left.region !== null &&
		right.region !== null
	) {
		if (
			left.region === right.region &&
			bothDeclare(left, right, "private-network")
		) {
			return "private-network";
		}
		if (bothDeclare(left, right, "cross-region")) {
			return "cross-region";
		}
	}

	if (left.providerId !== right.providerId) {
		if (bothDeclare(left, right, "private-interconnect")) {
			return "private-interconnect";
		}
		if (bothDeclare(left, right, "overlay-mesh")) {
			return "overlay-mesh";
		}
	}

	return "public-mtls";
}

/**
 * Derive the cross-cloud connectivity plan from the parsed junction: one
 * peering edge per member pair, a federated DNS plan, and the federation
 * records (trust anchors, policy packs, registry bundles) that ride the same
 * member mechanism. Pure derivation over declared manifests — no cloud calls.
 */
export function deriveConnectivityPlan(
	definition: JunctionDefinition,
): JunctionConnectivityPlan {
	const members = definition.members;
	const edges: PeeringEdge[] = [];
	const halvesByYard: Record<string, ConnectivityHalf[]> = Object.fromEntries(
		members.map((member) => [member.yardName, []]),
	);

	for (let i = 0; i < members.length; i += 1) {
		for (let j = i + 1; j < members.length; j += 1) {
			const source = members[i];
			const target = members[j];
			if (!source || !target) continue;
			const tier = selectConnectivityTier(source, target);
			const tierLevel = CONNECTIVITY_TIER_LEVELS[tier];
			const edgeId = `${source.yardName}->${target.yardName}`;

			edges.push({
				id: edgeId,
				sourceYard: source.yardName,
				targetYard: target.yardName,
				tier,
				tierLevel,
			});
			halvesByYard[source.yardName]?.push({
				edgeId,
				yardName: source.yardName,
				peerYardName: target.yardName,
				role: "source",
				tier,
				tierLevel,
			});
			halvesByYard[target.yardName]?.push({
				edgeId,
				yardName: target.yardName,
				peerYardName: source.yardName,
				role: "target",
				tier,
				tierLevel,
			});
		}
	}

	const zone = `${definition.name}.junction.internal`;
	const records: DnsRecord[] = members.map((member) => ({
		recordName: `${member.yardName}.${zone}`,
		recordType: "CNAME",
		target: `${member.yardName}.${member.providerId}.yard.internal`,
		ownerYard: member.yardName,
	}));

	return deepFreeze({
		kind: "junction-connectivity-plan",
		contract: JUNCTION_CONTRACT_VERSION,
		junctionName: definition.name,
		members: members.map((member) => member.yardName),
		event: {
			type: JUNCTION_PLAN_DERIVED_EVENT,
			junctionName: definition.name,
			edgeCount: edges.length,
		},
		edges,
		halvesByYard,
		dns: { zone, records },
		federation: deriveFederationPlan(definition),
	});
}

/**
 * Extract one yard's half of the plan — the mirrored edge halves it
 * terminates, the DNS records it must realize (its own) and resolve (all),
 * and the federation entries addressed to or issued by it. Each yard realizes
 * its own half; the junction never reaches into a member.
 */
export function planForYard(
	plan: JunctionConnectivityPlan,
	yardName: string,
): YardConnectivityHalfPlan {
	if (!plan.members.includes(yardName)) {
		throw new JunctionParseError(
			"junction.plan.unknown-yard",
			`${yardName} is not a member of junction ${plan.junctionName}`,
		);
	}

	return deepFreeze({
		junctionName: plan.junctionName,
		yardName,
		halves: plan.halvesByYard[yardName] ?? [],
		dnsRecordsToRealize: plan.dns.records.filter(
			(record) => record.ownerYard === yardName,
		),
		dnsRecordsToResolve: plan.dns.records,
		trustExchanges: plan.federation.trustExchanges.filter(
			(entry) => entry.fromYard === yardName || entry.toYard === yardName,
		),
		policyPacks: plan.federation.policyPacks.filter(
			(entry) => entry.toYard === yardName,
		),
		registryBundles: plan.federation.registryBundles.filter(
			(entry) => entry.fromYard === yardName || entry.toYard === yardName,
		),
	});
}

function bothDeclare(
	left: JunctionMemberManifest,
	right: JunctionMemberManifest,
	tier: ConnectivityTierName,
): boolean {
	return left.capabilities.includes(tier) && right.capabilities.includes(tier);
}
