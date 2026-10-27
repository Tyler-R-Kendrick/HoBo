import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { create } from "@bufbuild/protobuf";
import {
	AccountSchema,
	ConfigurationSchema,
	ConnectionSchema,
	JobSchema,
	OfferSchema,
	SandboxPricingSchema,
	sandboxUsageQuote,
} from "@hobo/ci";
import { PostgresCiStore } from "@hobo/ci/postgres";
import { type GithubTransport, HostedRelay } from "@hobo/ci-gh-actions";
import pg from "pg";
import {
	createSandboxController,
	type IsolatedSandboxDriver,
	type SandboxProxyDriver,
} from "../src/sandbox-controller.js";

const connectionString = process.env.HOBO_CI_TEST_POSTGRES;
if (!connectionString)
	throw new Error("disposable HOBO_CI_TEST_POSTGRES required");
const partition = `sandbox-${randomUUID()}`;
const pool = new pg.Pool({ connectionString });
const store = new PostgresCiStore(pool, partition);
const now = "2026-10-27T12:00:00.000Z";
const price = create(SandboxPricingSchema, {
	vcpus: 1,
	memoryMb: 2048,
	cpuMicrosPerVcpuHour: 128000,
	memoryMicrosPerGbHour: 21200,
	creationMicros: 1,
	egressMicrosPerGb: 150000,
	maxEgressBytes: 1000000,
	proxyMicrosPerGb: 150000,
	proxyFixedMicros: 1,
	bootstrapFixedMicros: 1,
	networkHeadroomBytes: 1000,
	proxyVmRequired: true,
	proxyVmVcpus: 1,
	proxyVmMemoryMb: 2048,
	proxyVmExtraMs: 120000,
	proxyVmNetworkBytes: 10000000,
	proxyVmNetworkHeadroomBytes: 1000,
	proxyControlMaxCalls: 100,
	proxyControlCallMicros: 1,
	region: "iad1",
	plan: "hobby",
});
const offer = create(OfferSchema, {
	id: "vercel",
	provider: "vercel",
	backend: "sandbox",
	providerAccountId: "account-1",
	enabled: true,
	runsOn: "sandbox",
	budgetMicros: 1000000,
	concurrency: 2,
	observedAt: "2026-10-27T00:00:00Z",
	validUntil: "2026-10-28T00:00:00Z",
	sourceUrl: "https://vercel.com/docs/sandbox/pricing",
	bridgeAcknowledged: true,
	sandboxPricing: price,
});
const account = create(AccountSchema, {
	id: "example",
	budgetMicros: 1000000,
	maxRuntimeMinutes: 5,
	startupMinutes: 1,
	offers: [offer],
});
const connection = create(ConnectionSchema, {
	accountId: "example",
	repository: "example/repository",
	repositoryId: 1,
	installationId: 1,
	bridgeWorkflow: "host.yml",
	bridgeSha: "0000000000000000000000000000000000000000",
	bridgeRef: "main",
	runnerGroupId: 1,
	dispatcherActorId: 1,
	allowedEvents: ["pull_request"],
	allowedRefs: ["refs/heads/main"],
	trustedRepositoryAcknowledged: true,
	publicRepositoryAcknowledged: true,
	allowAllPullRequests: true,
});
const configuration = create(ConfigurationSchema, {
	accounts: [account],
	connections: [connection],
});
let runnerName = "";
const run = (id: number) => ({
	id,
	run_attempt: 1,
	event: "pull_request",
	head_sha: "0000000000000000000000000000000000000000",
	head_branch: "feature",
	path: ".github/workflows/ci.yml",
	display_title: "PR",
	status: "in_progress",
	conclusion: null,
	run_started_at: now,
	updated_at: now,
	actor: { id: 1 },
	repository: { id: 1, private: false },
	head_repository: { id: 2 },
	pull_requests: [],
});
const github: GithubTransport = {
	async request(_installation, path, method = "GET", body) {
		if (path === "/repos/example/repository/actions/runs/100")
			return Response.json(run(100));
		if (path === "/repos/example/repository/actions/runs/101")
			return Response.json(run(101));
		if (path === "/repos/example/repository/actions/jobs/1000")
			return Response.json({
				id: 1000,
				run_id: 100,
				run_attempt: 1,
				status: "queued",
				labels: ["hobo"],
				runner_name: null,
			});
		if (path === "/repos/example/repository/actions/jobs/1001")
			return Response.json({
				id: 1001,
				run_id: 101,
				run_attempt: 1,
				status: "in_progress",
				labels: ["hobo"],
				runner_name: runnerName,
			});
		if (method === "POST" && path.endsWith("/generate-jitconfig")) {
			const request = JSON.parse(body ?? "{}");
			runnerName = request.name;
			return Response.json(
				{
					encoded_jit_config: "c2VjcmV0",
					runner: { id: 31, name: runnerName },
				},
				{ status: 201 },
			);
		}
		if (method === "DELETE" && path.endsWith("/31"))
			return new Response(null, { status: 204 });
		throw new Error(`unexpected GitHub contract ${method} ${path}`);
	},
};
const driver: IsolatedSandboxDriver = {
	async create({ name }) {
		return { name, sessionId: "sbx_test", expiresAt: Date.parse(now) + 360000 };
	},
	async discover() {
		return { sessionId: "sbx_test" };
	},
	async prepare() {},
	async start() {
		return { cmdId: "cmd_test" };
	},
	async inspect() {
		return { commandId: "cmd_test", exitCode: 0 };
	},
	async stop() {
		return {
			cpuMs: 1000,
			durationMs: 1000,
			memoryMb: 2048,
			vcpus: 1,
			egressBytes: 100,
			ingressBytes: 0,
			creations: 1,
			stoppedAt: Date.parse(now),
		};
	},
};
const proxyDriver: SandboxProxyDriver = {
	async create({ name }) {
		return {
			name,
			sessionId: "sbx_proxy",
			origin: "https://proxy.example",
			expiresAt: Date.parse(now) + 480000,
		};
	},
	async start() {
		return { commandId: "cmd_proxy" };
	},
	async bind() {},
	async discover() {
		return { sessionId: "sbx_proxy" };
	},
	async stop() {
		return {
			cpuMs: 1000,
			durationMs: 1000,
			memoryMb: 2048,
			vcpus: 1,
			egressBytes: 100,
			ingressBytes: 100,
			creations: 1,
			stoppedAt: Date.parse(now),
		};
	},
};
try {
	await store.configureWithRecord(
		configuration,
		0,
		now,
		"ci-policy:example",
		"example",
		JSON.stringify({
			accountId: "example",
			tenantId: "example",
			pool: { label: "hobo", os: "linux", architecture: "x64" },
			providers: [
				{
					id: "vercel",
					kind: "vercel",
					connectionRef: "account-1",
					runsOn: "sandbox",
					enabled: true,
				},
			],
			budget: {
				scope: "ci-account",
				currency: "USD",
				limitMicros: 1000000,
				period: "manual",
				timeZone: "UTC",
			},
			routing: {
				strategy: "lowest-total-incremental-cost",
				noEligibleProvider: "queue",
				unknownAllocation: "zero",
			},
			thresholds: [],
		}),
	);
	const host = createSandboxController({
		store,
		github,
		driver,
		proxyDriver,
		now: () => now,
		authorize: async () => ({
			revision: 1,
			connection,
			maxEgressBytes: price.maxEgressBytes,
			proxy: {
				extraMs: 120000,
				create: {
					plan: "hobby",
					region: "iad1",
					vcpus: 1,
					port: 3000,
					relayOrigin: "https://relay.example",
					domains: ["github.com"],
				},
				config: {
					relayOrigin: "https://relay.example",
					expectedIssuer: "https://oidc.vercel.com/team",
					teamId: "team_1",
					projectId: "prj_1",
					hosts: ["github.com"],
					maxEgressBytes: 1000000,
					maxControlCalls: 100,
					port: 3000,
					maxRequestBytes: 1000000,
					maxResponseBytes: 1000000,
				},
			},
			configuration: {
				plan: "hobby",
				vcpus: 1,
				forwardUrl: "https://relay.example.test/sandbox/egress",
				allowedDomains: ["github.com"],
			},
		}),
		charge: async (lease, guest, proxy) => {
			assert.ok(guest);
			assert.ok(proxy);
			const meter = await store.sandboxProxyUsage(
				lease.accountId,
				lease.id,
				lease.proxySandboxSessionId,
				lease.sandboxSessionId,
			);
			assert.ok(meter);
			return sandboxUsageQuote(price, {
				cpuVcpuMs: guest.durationMs * guest.vcpus,
				memoryMb: guest.memoryMb,
				durationMs: guest.durationMs,
				egressBytes: guest.egressBytes,
				proxyBytes: meter.bytes,
				proxyControlCalls: meter.calls,
				hostMicros: 0,
				proxyVm: {
					cpuVcpuMs: proxy.durationMs * proxy.vcpus,
					memoryMb: proxy.memoryMb,
					durationMs: proxy.durationMs,
					ingressBytes: proxy.ingressBytes,
					egressBytes: proxy.egressBytes,
				},
			});
		},
		assignment: async (lease) => {
			assert.equal(lease.actualJobId, 1001);
			return { kind: "assigned", jobId: lease.actualJobId };
		},
		unmet: async () =>
			create(JobSchema, {
				id: 1000,
				runId: 100,
				runAttempt: 1,
				repositoryId: 1,
				installationId: 1,
				repository: "example/repository",
				labels: ["hobo"],
				action: "queued",
				isolatedRequired: true,
			}),
	});
	const relay = new HostedRelay({
		config: configuration,
		store,
		github,
		isolatedHost: host,
		identity: {
			async verify() {
				throw new Error("unused");
			},
		},
		webhookSecret: "01234567890123456789012345678901",
		now: () => now,
	});
	const payload = (action: string, jobId: number, runId: number) =>
		Buffer.from(
			JSON.stringify({
				action,
				installation: { id: 1 },
				repository: { id: 1, full_name: "example/repository" },
				workflow_job: {
					id: jobId,
					run_id: runId,
					run_attempt: 1,
					labels: ["hobo"],
					runner_name: jobId === 1001 ? runnerName : null,
				},
			}),
		);
	assert.match(
		await relay.processWebhook(payload("queued", 1000, 100), "workflow_job"),
		/^reserved:/,
	);
	await relay.dispatchPending();
	const lease = (await store.all())[0];
	assert.ok(lease);
	assert.equal(lease.state, "running");
	await relay.processWebhook(payload("in_progress", 1001, 101), "workflow_job");
	assert.equal((await store.get(lease.id))?.actualJobId, 1001);
	await host.reconcile(lease.id);
	const settled = await store.get(lease.id);
	assert.equal(settled?.state, "completed");
	assert.equal(settled.actualJobId, 1001);
	assert.ok(settled.paidMicros > 0);
	assert.equal(settled.proxySandboxStage, "stopped");
	assert.ok(settled.proxyStoppedUsage);
	assert.deepEqual(
		(await store.pendingJobs()).map((entry) => [
			entry.id,
			entry.isolatedRequired,
		]),
		[[1000, true]],
	);
	console.log(
		"Public PR routing, actual assignment, usage settlement and original requeue passed against PostgreSQL",
	);
} finally {
	for (const table of [
		"hobo_ci_sandbox_proxy_requests",
		"hobo_ci_sandbox_proxies",
		"hobo_ci_sandbox_egress",
		"hobo_ci_assigned_jobs",
		"hobo_ci_pending_jobs",
		"hobo_ci_terminal_jobs",
		"hobo_ci_leases",
		"hobo_ci_events",
		"hobo_ci_control_records",
		"hobo_ci_configuration",
		"hobo_ci_partitions",
	]) {
		await pool
			.query(
				`DELETE FROM ${table} WHERE ${table === "hobo_ci_partitions" ? "id" : "partition_id"}=$1`,
				[partition],
			)
			.catch(() => undefined);
	}
	await pool.end();
}
