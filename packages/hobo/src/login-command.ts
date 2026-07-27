/**
 * Composed `hobo login` — fixture/OIDC session + optional default broker association.
 *
 * HONEST SCOPE: full OIDC browser flow and SPIRE-backed SVID brokering remain
 * behind local fixtures; this command persists principal + broker URI under HOBO_HOME.
 */
import {
	createFixtureSession,
	createLoginCommand as createCliLoginCommand,
	type CommandModule,
	type CommandResult,
	type LoginCommandDeps,
} from "@hobo/cli";

import { defaultHoboHome } from "./bare-metal-yard.js";
import { resolveBrokerUriFromFlags } from "./broker-target.js";
import { upsertLoginProfile } from "./hobo-profile.js";

export interface BrokerAwareLoginCommandDeps extends LoginCommandDeps {
	readonly env?: NodeJS.ProcessEnv;
}

export function createBrokerAwareLoginCommand(
	deps: BrokerAwareLoginCommandDeps = {},
): CommandModule {
	const base = createCliLoginCommand(deps);
	return {
		implemented: true,
		run: async (input): Promise<CommandResult> => {
			const result = await base.run(input);
			if (!result.ok) return result;

			const env = deps.env ?? process.env;
			const hoboHome =
				typeof input.flags.home === "string" && input.flags.home.length > 0
					? input.flags.home
					: defaultHoboHome(env);
			const brokerUri = resolveBrokerUriFromFlags({
				broker: input.flags.broker,
				brokerUri: input.flags.brokerUri,
			});

			const data = (result.data ?? {}) as {
				principal?: { kind: string; id: string };
				tenant?: string;
				token?: string;
			};
			const principal = data.principal ?? {
				kind: "user" as const,
				id: "user:local-fixture",
			};
			const tenant =
				typeof data.tenant === "string" ? data.tenant : "hobo-dev";
			const token =
				typeof data.token === "string"
					? data.token
					: createFixtureSession().token;

			const profile = upsertLoginProfile({
				hoboHome,
				principal: {
					kind: principal.kind as "user" | "agent" | "service" | "system",
					id: principal.id,
				},
				tenant,
				token,
				...(brokerUri !== null ? { brokerUri } : {}),
			});

			const message =
				brokerUri !== null
					? `${result.message}; default broker ${brokerUri}`
					: result.message;

			return {
				ok: true,
				status: result.status ?? "ok",
				code: result.code ?? "HOBO_OK",
				message: message ?? "hobo login ok",
				data: {
					...data,
					command: "login",
					profilePath: `${hoboHome}/profile.json`,
					defaultBrokerUri: profile.defaultBrokerUri ?? null,
					// Dual principal note: agent SVIDs are separate from human login.
					principalPlane: "identity",
				},
			};
		},
	};
}
