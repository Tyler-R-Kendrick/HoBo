import {
	createNeonSecretBroker,
	RuntimeBrokerConfig,
} from "./neon-secret-broker.js";
import { createNeonRepairTrigger } from "./neon-trigger.js";

/** A failed deployment configuration must not disclose secret values in logs. */
export function createNeonBrokerEntry(env: NodeJS.ProcessEnv) {
	let handler: ReturnType<typeof createNeonSecretBroker> | undefined;
	let trigger: ReturnType<typeof createNeonRepairTrigger> | undefined;
	try {
		const config = RuntimeBrokerConfig.parse(
			JSON.parse(env.HOBO_BROKER_RUNTIME_CONFIG ?? ""),
		);
		handler = createNeonSecretBroker({
			teamSlug: env.HOBO_BROKER_TEAM_SLUG ?? "",
			teamId: env.HOBO_BROKER_TEAM_ID ?? "",
			projectName: env.HOBO_BROKER_PROJECT_NAME ?? "",
			projectId: env.HOBO_BROKER_PROJECT_ID ?? "",
			audience: env.HOBO_BROKER_AUDIENCE ?? "",
			config,
		});
		if (env.HOBO_BROKER_TRIGGER_ID)
			trigger = createNeonRepairTrigger({
				triggerId: env.HOBO_BROKER_TRIGGER_ID,
				triggerName: env.HOBO_BROKER_TRIGGER_NAME ?? "",
				publicOrigin: config.HOBO_CI_PUBLIC_URL,
				cronSecret: config.CRON_SECRET,
			});
	} catch {
		// A missing or invalid secret configuration stays closed.
		handler = undefined;
		trigger = undefined;
	}
	return {
		async fetch(request: Request): Promise<Response> {
			if (new URL(request.url).pathname === "/internal/trigger")
				return trigger
					? trigger(request)
					: new Response(null, {
							status: 404,
							headers: { "cache-control": "no-store" },
						});
			if (!handler)
				return new Response(null, {
					status: 503,
					headers: { "cache-control": "no-store" },
				});
			return handler(request);
		},
	};
}

export default createNeonBrokerEntry(process.env);
