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

import {
	createDefaultCollectionTarget,
	createDefaultDevRuntime,
	createDefaultYardRuntime,
} from "./compose.js";
import { createDoctorCommand } from "./doctor-command.js";

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

	return createHoboCli({
		commands: {
			dev: createDevCommand({ runtime: devRuntime }),
			collect: createCollectCommand({ target }),
			plan: createPlanCommand({ runtime }),
			up: createUpCommand({ runtime }),
			down: createDownCommand({ runtime }),
			doctor: createDoctorCommand(),
		},
	});
}
