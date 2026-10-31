import { mirrorControl, mirrorLaneEndpoint } from "@hobo/contract-harness";

/**
 * The mirror lane's first act: find the emulator or stop the whole run with
 * the way to start one. Nothing in test/mirror is collected, let alone
 * skipped, without it.
 */
export async function setup(): Promise<void> {
	const endpoint = mirrorLaneEndpoint(process.env);
	const health = await mirrorControl(endpoint, "GET", "/_mirror/health");
	if (health.status !== 200) {
		throw new Error(
			`MIRROR_UNHEALTHY: ${endpoint.baseUrl}/_mirror/health answered ${health.status}`,
		);
	}
}
