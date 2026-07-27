import {
	type FunnelPublishOptions,
	type FunnelPublishResult,
	type MagicDnsSplitConfig,
	type MagicDnsSplitResult,
	type MeteringBus,
	type OverlayJoinOptions,
	type OverlayJoinResult,
	type OverlayNetwork,
	createUsageEvent,
} from "@hobo/core";

/**
 * Netbird overlay adapter (self-hosted alternative to Tailscale).
 * Implements the full OverlayNetwork surface including MagicDNS zones and
 * reverse-proxy gateway publishing as structured plans until a live agent client
 * is wired to the management API.
 */
export function createNetbirdOverlay(options?: {
	readonly metering?: MeteringBus;
	readonly managementUrl?: string;
}): OverlayNetwork {
	let current: OverlayJoinResult["identity"] | null = null;
	return {
		provider: "netbird",
		tenantTags({ tenantId, role, env, cloud, overlayNetworkId }) {
			const tags = [`tenant:${tenantId}`, `role:${role}`];
			if (env) tags.push(`env:${env}`);
			if (cloud) tags.push(`cloud:${cloud}`);
			if (overlayNetworkId) tags.push(`overlay:${overlayNetworkId}`);
			return tags;
		},
		async join(join: OverlayJoinOptions): Promise<OverlayJoinResult> {
			const tags = [...join.tags];
			if (!tags.some((t) => t.startsWith("tenant:"))) {
				tags.push(`tenant:${join.tenantId}`);
			}
			current = {
				nodeId: `netbird-stub:${join.hostname}`,
				hostname: join.hostname,
				overlayIps: [],
				tags,
				tenantId: join.tenantId,
			};
			await options?.metering?.emit(
				createUsageEvent({
					tenantId: join.tenantId,
					eventType: "overlay.join",
					resource: join.hostname,
					metadata: {
						provider: "netbird",
						ready: false,
						stub: true,
						...(options?.managementUrl
							? { managementUrl: options.managementUrl }
							: {}),
					},
				}),
			);
			join.emitProgress?.(
				"hobo overlay: netbird join recorded — wire management API for production readiness",
			);
			return {
				identity: current,
				provider: "netbird",
				ready: false,
				notes: [
					"netbird agent client pending; OverlayNetwork port surface (join/magicdns/funnel) is complete",
				],
			};
		},
		async status() {
			return current;
		},
		async leave() {
			if (current) {
				await options?.metering?.emit(
					createUsageEvent({
						tenantId: current.tenantId,
						eventType: "overlay.leave",
						resource: current.hostname,
						metadata: { provider: "netbird" },
					}),
				);
			}
			current = null;
		},
		async configureMagicDns(
			config: MagicDnsSplitConfig,
		): Promise<MagicDnsSplitResult> {
			await options?.metering?.emit(
				createUsageEvent({
					tenantId: config.tenantId,
					eventType: "overlay.magicdns",
					resource: config.domains.join(","),
					metadata: { provider: "netbird", applied: false },
				}),
			);
			return {
				applied: false,
				domains: config.domains,
				notes: [
					`netbird custom DNS zones planned for domains=[${config.domains.join(",")}] nameservers=[${config.nameservers.join(",")}]`,
				],
			};
		},
		async publishFunnel(
			funnel: FunnelPublishOptions,
		): Promise<FunnelPublishResult> {
			const gateway =
				funnel.hostnameHint &&
				(funnel.hostnameHint.endsWith(".netbird.selfhosted") ||
					funnel.hostnameHint.endsWith(".nb.local"))
					? funnel.hostnameHint
					: null;
			await options?.metering?.emit(
				createUsageEvent({
					tenantId: funnel.tenantId,
					eventType: "overlay.funnel",
					resource: funnel.backendUrl,
					metadata: {
						provider: "netbird",
						enabled: gateway !== null,
						gateway: gateway ?? "",
					},
				}),
			);
			return {
				enabled: gateway !== null,
				gatewayHostname: gateway,
				notes: gateway
					? [`netbird reverse-proxy gateway ${gateway}`]
					: [
							"netbird reverse proxy not configured; pass hostnameHint ending in .netbird.selfhosted or .nb.local",
						],
			};
		},
	};
}
