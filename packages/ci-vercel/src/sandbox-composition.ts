import { create, toJsonString } from "@bufbuild/protobuf";
import {
	effectiveCiAccount,
	JobSchema,
	parseCiPolicy,
	route,
	SandboxPricingSchema,
	sandboxProxyOnlyUsageQuote,
	sandboxUsageQuote,
} from "@hobo/ci";
import type { PostgresCiStore } from "@hobo/ci/postgres";
import { type GithubTransport, getJob } from "@hobo/ci-gh-actions";
import { z } from "zod";
import {
	createIsolatedSandbox,
	discoverIsolatedSandbox,
	inspectIsolatedCommand,
	prepareIsolatedSandbox,
	startIsolatedSandbox,
	stopIsolatedSandbox,
} from "./isolated-sandbox.js";
import {
	bindProxySandbox,
	createProxySandbox,
	discoverProxySandbox,
	startProxySandbox,
	stopProxySandbox,
} from "./proxy-sandbox.js";
import { createSandboxController } from "./sandbox-controller.js";
import { validateSandboxDomains } from "./sandbox-domains.js";

function required(env: NodeJS.ProcessEnv, name: string): string {
	const value = env[name];
	if (!value) throw new Error(`missing configuration: ${name}`);
	return value;
}

/** Sandbox execution is opt-in until deployment-specific platform limits and
 * identity claims are verified. No public PR is admitted without this host. */
export function createSandboxComposition(options: {
	env: NodeJS.ProcessEnv;
	publicOrigin: string;
	store: PostgresCiStore;
	github: GithubTransport;
}) {
	const { env, store, github } = options;
	if (!env.HOBO_CI_SANDBOX_ENABLED) return undefined;
	if (env.HOBO_CI_SANDBOX_ENABLED !== "1")
		throw new Error("invalid sandbox enablement");
	const domains = z
		.array(z.string())
		.parse(JSON.parse(required(env, "HOBO_CI_SANDBOX_DOMAINS_JSON")));
	const plan = env.HOBO_CI_SANDBOX_PLAN ?? "hobby";
	if (plan !== "hobby" && plan !== "pro" && plan !== "enterprise")
		throw new Error("invalid sandbox plan");
	const teamId = required(env, "HOBO_CI_SANDBOX_TEAM_ID");
	const projectId = required(env, "HOBO_CI_SANDBOX_PROJECT_ID");
	const issuer = required(env, "HOBO_CI_SANDBOX_ISSUER");
	const host = createSandboxController({
		store,
		github,
		reportFailure: (failure) => {
			// The controller only supplies a validated lease ID, fixed phase and
			// optional numeric status. Never log exception text or credentials.
			process.stderr.write(
				`${JSON.stringify({ event: "hobo_ci_sandbox_launch_failure", leaseId: failure.leaseId, phase: failure.phase, status: failure.status, proxyStartupReason: failure.proxyStartupReason })}\n`,
			);
		},
		proxyDriver: {
			create: createProxySandbox,
			start: startProxySandbox,
			bind: bindProxySandbox,
			discover: discoverProxySandbox,
			stop: stopProxySandbox,
		},
		driver: {
			create: createIsolatedSandbox,
			discover: discoverIsolatedSandbox,
			prepare: prepareIsolatedSandbox,
			start: startIsolatedSandbox,
			inspect: inspectIsolatedCommand,
			stop: stopIsolatedSandbox,
		},
		authorize: async (lease) => {
			const snapshot = await store.policySnapshot();
			const configuration = snapshot.state?.configuration;
			if (!configuration || !snapshot.state)
				throw new Error("configuration unavailable");
			const connection = configuration.connections.find(
				(entry) =>
					entry.accountId === lease.accountId &&
					entry.repositoryId === lease.repositoryId &&
					entry.installationId === lease.installationId &&
					entry.repository.toLowerCase() === lease.repository.toLowerCase(),
			);
			const original = configuration.accounts.find(
				(entry) => entry.id === lease.accountId,
			);
			if (
				!connection?.isolatedOnly ||
				!connection.acceptAllMatchingRepositoryJobs ||
				!connection.publicRepositoryAcknowledged ||
				connection.allowAllPullRequests ||
				connection.allowedEvents.length !== 0 ||
				connection.allowedRefs.length !== 0 ||
				!original ||
				!lease.sandboxPricing
			)
				throw new Error("sandbox binding unavailable");
			const desired = snapshot.policies.find(
				(entry) => entry.accountId === lease.accountId,
			);
			const account = desired
				? effectiveCiAccount(original, parseCiPolicy(desired.bodyJson))
				: original;
			const offer = account.offers.find((entry) => entry.id === lease.offerId);
			if (
				offer?.provider !== "vercel" ||
				// Free units belong to the Vercel billing team, not an arbitrary
				// customer-provided alias. Bind accounting to the actual runtime team.
				offer.providerAccountId !== teamId ||
				offer.backend !== "sandbox" ||
				!offer.sandboxPricing ||
				!offer.sandboxPricing.proxyVmRequired ||
				offer.sandboxPricing.plan !== plan ||
				offer.priceMicrosPerMinute !== 0 ||
				offer.priceMicrosPerMinute !== lease.priceMicrosPerMinute ||
				toJsonString(SandboxPricingSchema, offer.sandboxPricing) !==
					toJsonString(SandboxPricingSchema, lease.sandboxPricing) ||
				account.maxRuntimeMinutes + account.startupMinutes !==
					lease.reservedMinutes
			)
				throw new Error("sandbox offer changed");
			const decision = route(
				{
					...account,
					offers: account.offers.filter(
						(entry) =>
							entry.provider === "vercel" && entry.backend === "sandbox",
					),
				},
				(await store.accountLeases(lease.accountId)).filter(
					(entry) => entry.id !== lease.id,
				),
				new Date().toISOString(),
			);
			if (
				!decision ||
				decision.offer.id !== offer.id ||
				decision.paidMicros > lease.reservedPaidMicros
			)
				throw new Error("sandbox quote unavailable or changed");
			const fields = [
				"cpuVcpuMs",
				"memoryMbMs",
				"egressBytes",
				"creations",
				"proxyBytes",
				"proxySessions",
				"proxyControlCalls",
			] as const;
			if (
				fields.some(
					(key) =>
						(lease.sandboxReservedAllowance?.[key] ?? 0) >
						(decision.sandboxReservedAllowance?.[key] ?? 0),
				)
			)
				throw new Error("sandbox allowance changed");
			return {
				revision: snapshot.state.revision,
				connection,
				maxEgressBytes: offer.sandboxPricing.maxEgressBytes,
				configuration: {
					plan,
					vcpus: offer.sandboxPricing.vcpus,
					forwardUrl: `${options.publicOrigin}/sandbox/egress`,
					allowedDomains: domains,
					region: offer.sandboxPricing.region,
				},
				proxy: {
					extraMs: offer.sandboxPricing.proxyVmExtraMs,
					create: {
						plan,
						region: offer.sandboxPricing.region,
						vcpus: offer.sandboxPricing.proxyVmVcpus,
						port: 3000,
						relayOrigin: options.publicOrigin,
						domains,
					},
					config: {
						relayOrigin: options.publicOrigin,
						expectedIssuer: issuer,
						teamId,
						projectId,
						hosts: domains,
						maxEgressBytes: offer.sandboxPricing.maxEgressBytes,
						maxControlCalls: offer.sandboxPricing.proxyControlMaxCalls,
						port: 3000,
						maxRequestBytes: Math.min(
							offer.sandboxPricing.maxEgressBytes,
							1024 * 1024 * 1024,
						),
						maxResponseBytes: Math.min(
							offer.sandboxPricing.maxEgressBytes,
							1024 * 1024 * 1024,
						),
					},
				},
			};
		},
		charge: async (lease, guest, proxyUsage) => {
			if (!lease.sandboxPricing || !proxyUsage)
				throw new Error("sandbox usage missing");
			const meter = await store.sandboxProxyUsage(
				lease.accountId,
				lease.id,
				lease.proxySandboxSessionId,
				lease.sandboxSessionId,
			);
			if (!meter) throw new Error("sandbox proxy meter missing");
			const completedAt = Math.max(guest?.stoppedAt ?? 0, proxyUsage.stoppedAt);
			const free =
				completedAt <= Date.parse(lease.freeValidUntil)
					? lease.sandboxReservedAllowance
					: undefined;
			const proxyVm = {
				cpuVcpuMs: proxyUsage.durationMs * proxyUsage.vcpus,
				memoryMb: proxyUsage.memoryMb,
				durationMs: proxyUsage.durationMs,
				ingressBytes: proxyUsage.ingressBytes,
				egressBytes: proxyUsage.egressBytes,
			};
			if (!guest)
				return sandboxProxyOnlyUsageQuote(
					lease.sandboxPricing,
					{
						proxyVm,
						proxyBytes: meter.bytes,
						proxyControlCalls: meter.calls,
						hostMicros: 0,
					},
					free,
				);
			return sandboxUsageQuote(
				lease.sandboxPricing,
				{
					cpuVcpuMs: guest.durationMs * guest.vcpus,
					memoryMb: guest.memoryMb,
					durationMs: guest.durationMs,
					egressBytes: guest.egressBytes,
					proxyBytes: meter.bytes,
					proxyControlCalls: meter.calls,
					proxyVm,
					hostMicros: 0,
				},
				free,
			);
		},
		assignment: async (lease) => {
			if (!lease.actualJobId) return { kind: "unknown" };
			const job = await getJob(
				github,
				lease.installationId,
				lease.repository,
				lease.actualJobId,
			);
			if (job.id !== lease.actualJobId || job.runner_name !== lease.runnerName)
				throw new Error("runner assignment mismatch");
			return { kind: "assigned", jobId: job.id };
		},
		unmet: async (lease) => {
			const job = await getJob(
				github,
				lease.installationId,
				lease.repository,
				lease.jobId,
			);
			if (
				job.id !== lease.jobId ||
				job.run_id !== lease.originalRunId ||
				job.run_attempt !== lease.runAttempt
			)
				throw new Error("original job identity changed");
			if (job.status !== "queued") return undefined;
			return create(JobSchema, {
				id: lease.jobId,
				runId: lease.originalRunId,
				runAttempt: lease.runAttempt,
				repositoryId: lease.repositoryId,
				installationId: lease.installationId,
				repository: lease.repository,
				labels: job.labels,
				action: "queued",
				isolatedRequired: true,
			});
		},
	});
	return {
		host,
		allowedDomains: () => {
			validateSandboxDomains(domains);
			return [...domains];
		},
	};
}
