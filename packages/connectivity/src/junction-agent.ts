import {
	type MeteringBus,
	type OverlayNetwork,
	type PolicyEngine,
	type PublicDnsManager,
	type TenantId,
	createUsageEvent,
	parseTenantId,
} from "@hobo/core";

import {
	createJunctionDynamicDnsRegistrar,
	type DynamicDnsTarget,
	type JunctionDynamicDnsRegistrar,
} from "./dns/dynamic-registrar.js";
import {
	isolationClassTag,
	parseIsolationClass,
	type IsolationClass,
} from "./env-isolation/types.js";

export type JunctionAgentRole = "junction" | "broker";

export interface JunctionAgentConfig {
	readonly tenantId: TenantId | string;
	readonly name: string;
	readonly role?: JunctionAgentRole;
	/** Isolation class / env — fixed at start; change only via control-plane. */
	readonly env?: string;
	readonly cloud?: string;
	readonly authKey?: string;
	/** Hard isolation: stamp onto overlay tags. */
	readonly overlayNetworkId?: string;
	/** Targets to advertise via dynamic DNS on each heartbeat. */
	readonly dnsTargets?: readonly DynamicDnsTarget[];
	/**
	 * Peer junction isolation class for federation checks.
	 * Cross-env federation denied unless explicit grant presented to PolicyEngine.
	 */
	readonly federationPeerEnv?: string;
}

export interface JunctionAgent {
	readonly config: JunctionAgentConfig;
	readonly dynamicDns: JunctionDynamicDnsRegistrar | null;
	start(): Promise<{
		readonly ready: boolean;
		readonly notes: readonly string[];
		readonly overlayIps: readonly string[];
	}>;
	stop(): Promise<void>;
	heartbeat(): Promise<{
		readonly dns?: {
			readonly registered: number;
			readonly skipped: number;
		};
	}>;
	status(): Promise<{
		readonly running: boolean;
		readonly overlayIps: readonly string[];
	}>;
}

/**
 * Lightweight junction agent: joins overlay outbound-only, emits metering,
 * routes authorization through PolicyEngine, and optionally registers
 * hierarchical public DNS on heartbeats (Funnel gateway → CNAME).
 */
export function createJunctionAgent(options: {
	readonly config: JunctionAgentConfig;
	readonly overlay: OverlayNetwork;
	readonly policy?: PolicyEngine;
	readonly metering?: MeteringBus;
	readonly publicDns?: PublicDnsManager;
	readonly emitProgress?: (message: string) => void;
}): JunctionAgent {
	const tenantId =
		typeof options.config.tenantId === "string"
			? parseTenantId(options.config.tenantId)
			: options.config.tenantId;
	const role = options.config.role ?? "junction";
	let running = false;
	let overlayIps: string[] = [];

	const dynamicDns =
		options.publicDns !== undefined
			? createJunctionDynamicDnsRegistrar({
					tenantId,
					dns: options.publicDns,
					overlay: options.overlay,
					...(options.policy !== undefined
						? { policy: options.policy }
						: {}),
					...(options.metering !== undefined
						? { metering: options.metering }
						: {}),
					...(options.emitProgress !== undefined
						? { emitProgress: options.emitProgress }
						: {}),
				})
			: null;

	if (dynamicDns && options.config.dnsTargets) {
		dynamicDns.setTargets(options.config.dnsTargets);
	}

	return {
		config: { ...options.config, tenantId },
		dynamicDns,
		async start() {
			const isolationClass: IsolationClass | null = parseIsolationClass(
				options.config.env,
			);
			// Fail closed: Junction agents require an env / isolation class.
			if (!isolationClass) {
				return {
					ready: false,
					notes: [
						"junction env isolation class required (fail closed) — set config.env",
					],
					overlayIps: [],
				};
			}
			const envTag = isolationClassTag(isolationClass);
			const tags = [
				...options.overlay.tenantTags({
					tenantId,
					role,
					env: isolationClass,
					...(options.config.cloud !== undefined
						? { cloud: options.config.cloud }
						: {}),
					...(options.config.overlayNetworkId !== undefined
						? { overlayNetworkId: options.config.overlayNetworkId }
						: {}),
				}),
				envTag,
			];

			// Cross-env federation denied by default (peer env must match).
			if (options.config.federationPeerEnv !== undefined) {
				const peer = parseIsolationClass(options.config.federationPeerEnv);
				if (peer !== isolationClass) {
					return {
						ready: false,
						notes: [
							`junction env-scoped federation denied: ${isolationClass} cannot federate ${peer ?? "unknown"} without dual-controlled CrossEnvGrant`,
						],
						overlayIps: [],
					};
				}
			}

			if (options.policy) {
				const decision = await options.policy.evaluate({
					subject: {
						identity: options.config.name,
						tenantId,
						tags,
					},
					action: "junction.join",
					resource: {
						kind: "junction",
						id: options.config.name,
						tenantId,
						tags: [envTag],
					},
				});
				if (decision.effect === "deny") {
					return {
						ready: false,
						notes: decision.reasons,
						overlayIps: [],
					};
				}
			}

			const join = await options.overlay.join({
				tenantId,
				hostname: options.config.name,
				tags,
				...(options.config.authKey !== undefined
					? { authKey: options.config.authKey }
					: {}),
				...(options.emitProgress !== undefined
					? { emitProgress: options.emitProgress }
					: {}),
			});
			running = join.ready || join.identity.nodeId.startsWith("stub:");
			overlayIps = [...join.identity.overlayIps];

			// Configure MagicDNS split for hierarchical .hobo.test names when ready.
			if (join.ready && options.overlay.configureMagicDns) {
				const magic = await options.overlay.configureMagicDns({
					tenantId,
					domains: ["hobo.test", "hobo.internal"],
					nameservers: ["100.100.100.100"],
				});
				options.emitProgress?.(
					`hobo overlay magicdns: applied=${magic.applied} domains=${magic.domains.join(",")}`,
				);
			}

			await options.metering?.emit(
				createUsageEvent({
					tenantId,
					eventType: "junction.join",
					resource: options.config.name,
					metadata: {
						provider: join.provider,
						ready: join.ready,
						role,
					},
				}),
			);
			if (join.ready) {
				await options.metering?.emit(
					createUsageEvent({
						tenantId,
						eventType: "tunnel.up",
						resource: options.config.name,
						metadata: { provider: join.provider },
					}),
				);
			}
			return {
				ready: join.ready,
				notes: join.notes,
				overlayIps,
			};
		},
		async stop() {
			if (running) {
				await options.metering?.emit(
					createUsageEvent({
						tenantId,
						eventType: "tunnel.down",
						resource: options.config.name,
					}),
				);
				await options.metering?.emit(
					createUsageEvent({
						tenantId,
						eventType: "junction.leave",
						resource: options.config.name,
					}),
				);
			}
			await options.overlay.leave();
			running = false;
			overlayIps = [];
		},
		async heartbeat() {
			if (!running) return {};
			await options.metering?.emit(
				createUsageEvent({
					tenantId,
					eventType: "tunnel.heartbeat",
					resource: options.config.name,
					unit: "tick",
				}),
			);
			if (dynamicDns) {
				const dns = await dynamicDns.onHeartbeat();
				return {
					dns: {
						registered: dns.registered,
						skipped: dns.skipped,
					},
				};
			}
			return {};
		},
		async status() {
			return { running, overlayIps };
		},
	};
}
