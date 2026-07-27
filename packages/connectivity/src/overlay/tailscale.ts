import { spawnSync } from "node:child_process";

import {
	type FunnelPublishOptions,
	type FunnelPublishResult,
	type MagicDnsSplitConfig,
	type MagicDnsSplitResult,
	type MeteringBus,
	type OverlayIdentity,
	type OverlayJoinOptions,
	type OverlayJoinResult,
	type OverlayNetwork,
	type PolicyEngine,
	type TenantId,
	createUsageEvent,
	parseTenantId,
} from "@hobo/core";

export type TailscaleRunner = (
	args: readonly string[],
	env?: NodeJS.ProcessEnv,
) => { ok: boolean; stdout: string; stderr: string };

/**
 * Tailscale overlay adapter with MagicDNS split DNS and Funnel gateway automation.
 * Uses the official `tailscale` CLI when present; otherwise degrades offline-friendly.
 */
export function createTailscaleOverlay(options?: {
	readonly metering?: MeteringBus;
	readonly policy?: PolicyEngine;
	readonly bin?: string;
	readonly run?: TailscaleRunner;
	/** Default MagicDNS domains for hierarchical overlay names. */
	readonly defaultMagicDnsDomains?: readonly string[];
}): OverlayNetwork {
	const bin = options?.bin ?? "tailscale";
	const run: TailscaleRunner =
		options?.run ??
		((args, env) => {
			const result = spawnSync(bin, [...args], {
				encoding: "utf8",
				env: { ...process.env, ...env },
			});
			return {
				ok: result.status === 0,
				stdout: result.stdout ?? "",
				stderr: result.stderr ?? "",
			};
		});

	let current: OverlayIdentity | null = null;

	return {
		provider: "tailscale",
		tenantTags({ tenantId, role, env, cloud, overlayNetworkId }) {
			const tags = [
				`tenant:${tenantId}`,
				`role:${role}`,
				`tag:${role === "laptop" ? "dev-laptop" : role}`,
			];
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

			if (options?.policy) {
				const decision = await options.policy.evaluate({
					subject: {
						identity: join.hostname,
						tenantId: join.tenantId,
						tags,
					},
					action: "overlay.join",
					resource: {
						kind: "overlay",
						id: "tailscale",
						tenantId: join.tenantId,
						tags,
					},
				});
				if (decision.effect === "deny") {
					return {
						identity: {
							nodeId: "denied",
							hostname: join.hostname,
							overlayIps: [],
							tags,
							tenantId: join.tenantId,
						},
						provider: "tailscale",
						ready: false,
						notes: decision.reasons,
					};
				}
			}

			const notes: string[] = [];
			const statusProbe = run(["status", "--json"]);
			if (!statusProbe.ok) {
				notes.push(
					"tailscale CLI not available or not logged in; overlay join degraded (install tailscale and authenticate for full cross-cloud)",
				);
				current = {
					nodeId: `stub:${join.hostname}`,
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
						metadata: { provider: "tailscale", ready: false },
					}),
				);
				join.emitProgress?.(
					"hobo overlay: tailscale unavailable — continuing in degraded mode",
				);
				return {
					identity: current,
					provider: "tailscale",
					ready: false,
					notes,
				};
			}

			if (join.authKey) {
				const up = run([
					"up",
					"--authkey",
					join.authKey,
					"--hostname",
					join.hostname,
					"--advertise-tags",
					tags.join(","),
					"--accept-dns=true",
				]);
				if (!up.ok) {
					notes.push(
						`tailscale up failed: ${up.stderr.trim() || up.stdout.trim()}`,
					);
				}
			} else {
				notes.push(
					"no authKey provided; assuming existing tailscale session (set HOBO_TAILSCALE_AUTHKEY to enroll)",
				);
			}

			// Ensure MagicDNS acceptance for hierarchical resolution.
			const setDns = run(["set", "--accept-dns=true"]);
			if (!setDns.ok) {
				notes.push(
					`tailscale set --accept-dns failed: ${setDns.stderr.trim() || "unknown"}`,
				);
			}

			let nodeId = join.hostname;
			let overlayIps: string[] = [];
			let dnsName: string | undefined;
			try {
				const parsed = JSON.parse(statusProbe.stdout) as {
					Self?: {
						ID?: string;
						DNSName?: string;
						TailscaleIPs?: string[];
					};
				};
				nodeId = parsed.Self?.ID ?? nodeId;
				overlayIps = parsed.Self?.TailscaleIPs ?? [];
				dnsName = parsed.Self?.DNSName?.replace(/\.$/, "");
			} catch {
				notes.push("could not parse tailscale status --json");
			}

			current = {
				nodeId,
				hostname: join.hostname,
				overlayIps,
				tags,
				tenantId: join.tenantId,
			};
			await options?.metering?.emit(
				createUsageEvent({
					tenantId: join.tenantId,
					eventType: "overlay.join",
					resource: join.hostname,
					metadata: {
						provider: "tailscale",
						ready: true,
						ips: overlayIps.join(","),
						...(dnsName !== undefined ? { dnsName } : {}),
					},
				}),
			);
			join.emitProgress?.(
				`hobo overlay: joined tailscale as ${join.hostname} tags=[${tags.join(",")}]` +
					(dnsName ? ` magicdns=${dnsName}` : ""),
			);
			return {
				identity: current,
				provider: "tailscale",
				ready: true,
				notes,
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
						metadata: { provider: "tailscale" },
					}),
				);
			}
			current = null;
		},
		async configureMagicDns(
			config: MagicDnsSplitConfig,
		): Promise<MagicDnsSplitResult> {
			const notes: string[] = [];
			const domains =
				config.domains.length > 0
					? config.domains
					: (options?.defaultMagicDnsDomains ?? ["hobo.test", "hobo.internal"]);

			// Accept DNS + document split DNS map. Tailscale admin split DNS is often
			// console/API configured; CLI best-effort applies local accept + records intent.
			const accept = run(["set", "--accept-dns=true"]);
			if (!accept.ok) {
				notes.push(
					`accept-dns failed: ${accept.stderr.trim() || accept.stdout.trim() || "cli error"}`,
				);
			}

			// Prefer tailscale debug / set when available; always emit structured plan notes.
			const nameservers =
				config.nameservers.length > 0
					? config.nameservers
					: ["100.100.100.100"];
			const planLine = `split-dns domains=[${domains.join(",")}] nameservers=[${nameservers.join(",")}] tenant=${config.tenantId}`;
			notes.push(planLine);

			// Attempt: tailscale set --advertise-routes is wrong for DNS; use `tailscale dns` if present.
			const dnsHelp = run(["dns", "--help"]);
			let applied = accept.ok;
			if (dnsHelp.ok) {
				for (const domain of domains) {
					// Best-effort: some builds support `tailscale dns set-split` variants.
					const attempt = run([
						"dns",
						"set",
						"--domain",
						domain,
						"--nameservers",
						nameservers.join(","),
					]);
					if (!attempt.ok) {
						notes.push(
							`dns set ${domain}: ${attempt.stderr.trim() || "not supported by this CLI; configure split DNS in admin console"}`,
						);
					} else {
						applied = true;
					}
				}
			} else {
				notes.push(
					"tailscale dns subcommand unavailable; configure MagicDNS split DNS for hobo.test in the admin console (plan recorded)",
				);
			}

			await options?.metering?.emit(
				createUsageEvent({
					tenantId: config.tenantId,
					eventType: "overlay.magicdns",
					resource: domains.join(","),
					metadata: {
						applied,
						nameservers: nameservers.join(","),
					},
				}),
			);

			return { applied, notes, domains };
		},
		async publishFunnel(
			funnel: FunnelPublishOptions,
		): Promise<FunnelPublishResult> {
			const notes: string[] = [];
			const port =
				funnel.localPort ??
				(() => {
					try {
						return Number(new URL(funnel.backendUrl).port) || 80;
					} catch {
						return 80;
					}
				})();

			// Try modern `tailscale funnel` then legacy `tailscale serve --bg --https=443`.
			const attempts: readonly (readonly string[])[] = [
				["funnel", "--bg", `${port}`],
				["funnel", `${port}`],
				["serve", "--bg", "--https=443", `${port}`],
				["serve", "--https=443", `${port}`],
			];

			let enabled = false;
			let gatewayHostname: string | null = null;

			for (const args of attempts) {
				const result = run(args);
				if (result.ok) {
					enabled = true;
					const combined = `${result.stdout}\n${result.stderr}`;
					const match =
						combined.match(
							/https?:\/\/([a-z0-9.-]+\.ts\.net)/i,
						) ??
						combined.match(
							/([a-z0-9.-]+\.ts\.net)/i,
						);
					if (match?.[1]) {
						gatewayHostname = match[1].toLowerCase();
					}
					notes.push(`funnel command ok: ${args.join(" ")}`);
					break;
				}
				notes.push(
					`funnel attempt failed (${args.join(" ")}): ${result.stderr.trim() || result.stdout.trim() || "error"}`,
				);
			}

			if (!gatewayHostname && funnel.hostnameHint) {
				// Only accept *.ts.net style hints — never raw IPs.
				const hint = funnel.hostnameHint.replace(/\.$/, "").toLowerCase();
				if (hint.endsWith(".ts.net") || hint.endsWith(".tailscale.com")) {
					gatewayHostname = hint;
					notes.push(`using hostnameHint gateway ${hint}`);
				} else {
					notes.push(
						`hostnameHint rejected (must be authenticated funnel host): ${hint}`,
					);
				}
			}

			if (!gatewayHostname && current) {
				// Derive from MagicDNS name if available via status.
				const status = run(["status", "--json"]);
				if (status.ok) {
					try {
						const parsed = JSON.parse(status.stdout) as {
							Self?: { DNSName?: string };
						};
						const dns = parsed.Self?.DNSName?.replace(/\.$/, "");
						if (dns?.endsWith(".ts.net")) {
							gatewayHostname = dns;
							notes.push(`derived funnel host from MagicDNS ${dns}`);
						}
					} catch {
						// ignore
					}
				}
			}

			if (!enabled && !gatewayHostname) {
				notes.push(
					"Funnel not enabled; install/login tailscale and enable Funnel in ACL, or pass hostnameHint ending in .ts.net",
				);
			}

			funnel.emitProgress?.(
				gatewayHostname
					? `hobo funnel: gateway ${gatewayHostname} → ${funnel.backendUrl}`
					: `hobo funnel: not ready (${notes[notes.length - 1] ?? "unknown"})`,
			);

			const result: FunnelPublishResult = {
				enabled: enabled || gatewayHostname !== null,
				gatewayHostname,
				notes,
			};

			await options?.metering?.emit(
				createUsageEvent({
					tenantId: funnel.tenantId,
					eventType: "overlay.funnel",
					resource: funnel.backendUrl,
					metadata: {
						enabled: result.enabled,
						gateway: gatewayHostname ?? "",
					},
				}),
			);

			return result;
		},
	};
}

export function parseTenantTag(tags: readonly string[]): TenantId | null {
	const hit = tags.find((t) => t.startsWith("tenant:"));
	if (!hit) return null;
	return parseTenantId(hit.slice("tenant:".length));
}
