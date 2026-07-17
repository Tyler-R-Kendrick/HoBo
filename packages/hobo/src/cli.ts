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
import { createAttestCommand } from "./attest-command.js";
import { createClaimCommand } from "./claim-command.js";
import {
	createDefaultCollectionTarget,
	createDefaultDevRuntime,
	createDefaultYardRuntime,
} from "./compose.js";
import { createDoctorCommand } from "./doctor-command.js";
import { createDriftCommand } from "./drift-command.js";
import { createEraseCommand } from "./erase-command.js";
import { createInspectCommand } from "./inspect-command.js";
import { createLogsCommand } from "./logs-command.js";
import { createRegistryCommand } from "./registry-command.js";
import { createRunbookCommand } from "./runbook-command.js";
import { createSandboxCommand } from "./sandbox-command.js";
import { createVerifyCommand } from "./verify-command.js";

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
export function createComposedHoboCli(
	options: ComposedHoboCliOptions = {},
): HoboCli {
	const runtime = options.yardRuntime ?? createDefaultYardRuntime();
	const devRuntime = options.devRuntime ?? createDefaultDevRuntime();
	const target = options.collectionTarget ?? createDefaultCollectionTarget();
	// `sandbox` and its `test` alias share one command; each run() boots its OWN
	// fresh runtime-local Camp (isolation), so no shared runtime is threaded here.
	const sandbox = createSandboxCommand();

	return createHoboCli({
		commands: {
			dev: createDevCommand({ runtime: devRuntime }),
			collect: createCollectCommand({ target }),
			plan: createPlanCommand({ runtime }),
			up: createUpCommand({ runtime }),
			down: createDownCommand({ runtime }),
			doctor: createDoctorCommand(),
			verify: createVerifyCommand(),
			inspect: createInspectCommand({ runtime }),
			drift: createDriftCommand({ runtime }),
			attest: createAttestCommand({ runtime }),
			claim: createClaimCommand({ runtime }),
			registry: createRegistryCommand({ runtime }),
			logs: createLogsCommand(),
			runbook: createRunbookCommand({ runtime }),
			erase: createEraseCommand({ runtime }),
			sandbox,
			test: sandbox,
		},
	});
}
