import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dogfoodSummary } from "./dogfood.js";
import {
	type BudgetPolicy,
	createBudgetTracker,
	DEFAULT_BUDGET_POLICY,
} from "./finops.js";
import { createHarnessCore, type HarnessCore } from "./harness.js";
import {
	type CreateIsolationOptions,
	cleanupIsolation,
	createIsolationContext,
} from "./isolation.js";
import {
	type CodeFeaturePort,
	type CodePlatformSnapshot,
	composeCodePlatform,
	createMemoryFeaturePort,
	type SweProviderId,
} from "./platform.js";
import { registerCodeNamedEndpoint } from "./remote.js";
import {
	buildMultiplexerStatus,
	createPane,
	type MultiplexerStatus,
	setPaneState,
} from "./tui.js";
import type { HandbackReport, IsolationContext } from "./types.js";

export interface CodeSessionOptions {
	readonly projectRoot: string;
	readonly hoboHome: string;
	readonly stationId?: string;
	readonly budget?: BudgetPolicy;
	readonly isolation?: Partial<CreateIsolationOptions>;
	/** OpenFeature port (ADR-0044); defaults to memory with harness enabled. */
	readonly features?: CodeFeaturePort;
	readonly routingPolicy?: "cheapest-capable" | "pinned" | "fallback-chain";
	readonly pinnedProvider?: SweProviderId;
	readonly autoInitStation?: boolean;
	readonly tenant?: string;
}

export interface CodeSession {
	readonly isolation: IsolationContext;
	readonly harness: HarnessCore;
	readonly platform: CodePlatformSnapshot;
	readonly status: () => MultiplexerStatus;
	readonly setAgentState: (
		agentId: string,
		state: "blocked" | "working" | "done" | "idle",
		summary?: string,
	) => void;
	readonly budget: ReturnType<typeof createBudgetTracker>;
	readonly remote: ReturnType<typeof registerCodeNamedEndpoint>;
	readonly dogfood: ReturnType<typeof dogfoodSummary>;
	readonly complete: (
		ok: boolean,
		gates?: readonly string[],
	) => Promise<HandbackReport>;
	readonly cancel: () => Promise<HandbackReport>;
}

/**
 * Full agent session: station-bound isolation + harness + TUI + FinOps +
 * OpenFeature progressive flags + SWE provider mux + dogfood.
 */
export async function startCodeSession(
	options: CodeSessionOptions,
): Promise<CodeSession> {
	const features = options.features ?? createMemoryFeaturePort();
	const platform = composeCodePlatform({
		hoboHome: options.hoboHome,
		...(options.stationId !== undefined
			? { stationId: options.stationId }
			: {}),
		autoInitStation: options.autoInitStation !== false,
		...(options.tenant !== undefined ? { tenant: options.tenant } : {}),
		features,
		...(options.routingPolicy !== undefined
			? { routingPolicy: options.routingPolicy }
			: {}),
		...(options.pinnedProvider !== undefined
			? { pinnedProvider: options.pinnedProvider }
			: {}),
	});

	if (!platform.features.harnessEnabled) {
		throw new Error(
			"code.harness.enabled is false (OpenFeature) — enable via hobo feature set code.harness.enabled",
		);
	}

	// Rift only when OpenFeature code.isolation.rift is on AND not forced off.
	const forceWorktree =
		options.isolation?.forceWorktree ?? !platform.features.riftPreferred;

	const isolation = await createIsolationContext({
		projectRoot: options.projectRoot,
		hoboHome: options.hoboHome,
		stationId: platform.station.stationId,
		...options.isolation,
		forceWorktree,
	});

	const worldRoot = join(options.hoboHome, "worlds");
	const harness = createHarnessCore({ worldRoot });
	const budget = createBudgetTracker({
		...(options.budget ?? DEFAULT_BUDGET_POLICY),
		monetizationOptIn:
			options.budget?.monetizationOptIn === true ||
			platform.features.monetizationSurface,
	});
	const remote = registerCodeNamedEndpoint({
		mode: "local",
		project: "hobo-code",
		branch: isolation.branch,
		tenant: options.tenant ?? "local",
	});
	const dogfood = dogfoodSummary(platform.station.stationId);

	const panes = new Map([
		[
			"coordinator",
			createPane("coordinator", "working", `open · ${platform.provider.id}`),
		],
	]);

	const finish = async (
		ok: boolean,
		gates: readonly string[] = [],
	): Promise<HandbackReport> => {
		const result = await cleanupIsolation(isolation.runId, {
			hoboHome: options.hoboHome,
			ok,
			gates,
		});
		mkdirSync(isolation.durableRoot, { recursive: true });
		writeFileSync(
			join(isolation.durableRoot, "session-end.json"),
			JSON.stringify(
				{
					ok,
					gates,
					handback: result.handback,
					remote,
					dogfood,
					budget: budget.snapshot(),
					platform,
				},
				null,
				2,
			),
			"utf8",
		);
		return result.handback;
	};

	return {
		isolation,
		harness,
		platform,
		budget,
		remote,
		dogfood,
		status() {
			return buildMultiplexerStatus([...panes.values()], {
				remoteReady: true,
				theme: "herdr",
			});
		},
		setAgentState(agentId, state, summary) {
			const existing = panes.get(agentId) ?? createPane(agentId);
			panes.set(agentId, setPaneState(existing, state, summary));
		},
		complete(ok, gates) {
			return finish(ok, gates);
		},
		cancel() {
			return finish(false, ["cancelled"]);
		},
	};
}
