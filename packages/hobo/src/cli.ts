import type { CollectionTarget } from "@hobo/bindles";
import {
	createCollectCommand,
	createDevCommand,
	createDownCommand,
	createHoboCli,
	createPlanCommand,
	createUpCommand,
	type DevRuntime,
	type HoboCli,
	type YardRuntime,
} from "@hobo/cli";
import { createAwsProvider } from "@hobo/provider-aws";
import { createAzureProvider } from "@hobo/provider-azure";
import { createGcpProvider } from "@hobo/provider-gcp";
import { createLakebedProvider } from "@hobo/provider-lakebed";
import { createBlacksmithCatalogEntry } from "@hobo/runner-blacksmith";
import { createDepotCatalogEntry } from "@hobo/runner-depot";
import { createGithubRunnerCatalogEntry } from "@hobo/runner-github";
import { createAddCommand, registerInstallable } from "./add-command.js";
import { createAttestCommand } from "./attest-command.js";
import { serveProjectOnLocalYard } from "./wasm-host.js";
import { createBrokerCommand } from "./broker-command.js";
import { createCanDeployCommand } from "./can-deploy-command.js";
import { createClaimCommand } from "./claim-command.js";
import {
	createDefaultYardRuntime,
	resolveProjectCollectionTarget,
	resolveProjectDevRuntime,
	toRegistrableProvider,
} from "./compose.js";
import { createDerivativeCommand } from "./derivative-command.js";
import { createDoctorCommand } from "./doctor-command.js";
import { createDriftCommand } from "./drift-command.js";
import { createEraseCommand } from "./erase-command.js";
import { createGenerateCommand } from "./generate-command.js";
import { createImportCommand } from "./import-command.js";
import { createInspectCommand } from "./inspect-command.js";
import { createLocalProvider } from "./local-provider.js";
import { createLogsCommand } from "./logs-command.js";
import { createRegistryCommand } from "./registry-command.js";
import {
	createCloudNativeRuntimeCatalogEntry,
	createLocalRuntimeCatalogEntry,
	createOciRuntimeCatalogEntry,
	createWasmRuntimeCatalogEntry,
} from "./runtime-catalog.js";
import { createRunbookCommand } from "./runbook-command.js";
import { createSandboxCommand } from "./sandbox-command.js";
import { createVerifyCommand } from "./verify-command.js";
import { createBrokerAwareUpCommand } from "./broker-up-command.js";
import { createBrokerAwareLoginCommand } from "./login-command.js";
import { createYardCommand } from "./yard-command.js";

export interface ComposedHoboCliOptions {
	// Override the default local/mocked YardRuntime shared across plan/up/down.
	// Injecting one lets a caller (e.g. a test) hold the runtime so it can close
	// `runtime.store` afterward.
	readonly yardRuntime?: YardRuntime;
	// Override the default offline DevRuntime `hobo dev` boots.
	readonly devRuntime?: DevRuntime;
	// Override the default `hobo collect` target.
	readonly collectionTarget?: CollectionTarget;
}

// The composed `hobo` CLI. It reuses `createHoboCli` from @hobo/cli and injects
// the DEFAULT runtimes into the command factories that would otherwise fall back
// to shell stubs when un-injected. ONE YardRuntime is shared across plan/up/down
// so `up` then `down` operate on the same event store. `login`/`new`/`build`/
// `codegen` keep @hobo/cli's defaults — they already work un-injected.
// Default-provider catalog entries (M1+ adapter slices): each real provider
// registers itself as `hobo add`-able here at the composition root, keeping
// add-command free of adapter imports. Approval semantics stay with HOBO-710
// (`hobo add aws` registers + approves; `--hold` defers approval).
registerInstallable("aws", () => toRegistrableProvider(createAwsProvider()));
registerInstallable("azure", () =>
	toRegistrableProvider(createAzureProvider()),
);
registerInstallable("gcp", () => toRegistrableProvider(createGcpProvider()));
// The competitor deploy target registers HELD by default (ADR-0127): a second
// `hobo add lakebed` records the explicit approval.
registerInstallable(
	"lakebed",
	() => toRegistrableProvider(createLakebedProvider()),
	{ defaultHold: true },
);
// The GitHub Actions execution-host adapter (M3): both `hobo:runner` and
// `hobo:build-machine` ports register from one catalog entry so the
// Dispatcher can cost-route jobs/builds across registered hosts (ADR-0071).
registerInstallable("runner-github", () => createGithubRunnerCatalogEntry());
// The Blacksmith fast-runner sibling: same job model, cheaper runs-on
// substrate — registering both gives the Dispatcher a real price choice.
registerInstallable("runner-blacksmith", () => createBlacksmithCatalogEntry());
// The Depot remote-build specialist: shared-cache economics make its warm
// builds competitive with "free" cold options (HOBO-720).
registerInstallable("runner-depot", () => createDepotCatalogEntry());
// Local provider — installable via `hobo add local`; default provider id for
// local Yard topologies (`hobo yard init`).
registerInstallable("local", () => createLocalProvider());
// Camp component-host runtimes (installable; broker hard-fails when missing).
registerInstallable("runtime-local", () => createLocalRuntimeCatalogEntry());
registerInstallable("runtime-wasm", () => createWasmRuntimeCatalogEntry());
registerInstallable("runtime-oci", () => createOciRuntimeCatalogEntry());
registerInstallable("runtime-cloud-native", () =>
	createCloudNativeRuntimeCatalogEntry(),
);

export function createComposedHoboCli(
	options: ComposedHoboCliOptions = {},
): HoboCli {
	const runtime = options.yardRuntime ?? createDefaultYardRuntime();
	// `sandbox` and its `test` alias share one command; each run() boots its OWN
	// fresh runtime-local Camp (isolation), so no shared runtime is threaded here.
	const sandbox = createSandboxCommand();

	return createHoboCli({
		commands: {
			// Local loop: open the Yard, place the Bindle into a Camp, run the Camp's
			// component host (services__* + bindle env + external-only TCP).
			dev: createDevCommand(
				options.devRuntime !== undefined
					? { runtime: options.devRuntime }
					: {
							resolveRuntime: resolveProjectDevRuntime,
							serveProject: async ({ projectDir, port, emitProgress }) => {
								const hoboHome = process.env.HOBO_HOME;
								const hostEnv = process.env.HOBO_YARD_HOST;
								const serve = await serveProjectOnLocalYard({
									projectDir,
									...(port !== undefined ? { port } : {}),
									...(typeof hoboHome === "string" && hoboHome.length > 0
										? { hoboHome }
										: {}),
									...(hostEnv === "local" ||
									hostEnv === "wasm" ||
									hostEnv === "oci" ||
									hostEnv === "cloud-native" ||
									hostEnv === "isolated-wasm" ||
									hostEnv === "bare-metal" ||
									hostEnv === "runtime-local"
										? { componentHost: hostEnv }
										: {}),
									emitProgress,
								});
								return {
									primaryUrl: serve.primaryUrl,
									bindleName: serve.bindleName,
									campId: serve.campId,
									yardName: serve.yard.name,
									providerId: serve.yard.providerId,
									endpoints: serve.endpoints,
									exposedEndpoints: serve.exposedEndpoints,
									serviceDiscovery: serve.serviceDiscovery,
									bindleEnv: serve.bindleEnv,
									...(serve.namedEndpoints !== undefined
										? { namedEndpoints: serve.namedEndpoints }
										: {}),
									...(serve.primaryNamedUrl !== undefined
										? { primaryNamedUrl: serve.primaryNamedUrl }
										: {}),
									probe: serve.probe,
									close: serve.close,
									waitUntilStopped: serve.waitUntilStopped,
									componentHost: serve.componentHost,
								};
							},
						},
			),
			collect: createCollectCommand(
				options.collectionTarget !== undefined
					? { target: options.collectionTarget }
					: { resolveTarget: resolveProjectCollectionTarget },
			),
			plan: createPlanCommand({ runtime }),
			// Always place through the embedded broker-runtime (prefer wasm-sandbox yards).
			// Remote --broker / --anonymous paths use discovery + credential presenter.
			// The cloud mock `createUpCommand` remains for tests that wire it directly.
			up: createBrokerAwareUpCommand({ runtime }),
			// Identity plane: persist profile + optional default broker association.
			login: createBrokerAwareLoginCommand(),
			down: createDownCommand({ runtime }),
			doctor: createDoctorCommand(),
			verify: createVerifyCommand(),
			"can-deploy": createCanDeployCommand(),
			// The broker (the Conductor) resolves against the same live,
			// approval-gated registry the Planner matches over.
			broker: createBrokerCommand({ catalog: runtime.registry }),
			// Install/inspect the default bare-metal yard (`hobo yard init|status`).
			yard: createYardCommand(),
			inspect: createInspectCommand({ runtime }),
			drift: createDriftCommand({ runtime }),
			attest: createAttestCommand({ runtime }),
			claim: createClaimCommand({ runtime }),
			registry: createRegistryCommand({ runtime }),
			add: createAddCommand({ runtime }),
			import: createImportCommand({ runtime }),
			generate: createGenerateCommand({ runtime }),
			derivative: createDerivativeCommand({ runtime }),
			logs: createLogsCommand(),
			runbook: createRunbookCommand({ runtime }),
			erase: createEraseCommand({ runtime }),
			sandbox,
			test: sandbox,
		},
	});
}
