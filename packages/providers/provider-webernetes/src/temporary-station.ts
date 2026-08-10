import {
	TEMPORARY_STATION_TTL_MS,
	type TemporaryEnvironmentStationResult,
	temporaryStationExpiresAt,
	temporaryStationTtlSeconds,
} from "@hobo/core";
import { PROVIDER_TARGET } from "./options.js";
import {
	parseWebernetesStationDeployment,
	parseWebernetesStationId,
	type WebernetesStationDeployment,
} from "./parse.js";

export const supportsAnonymousTemporaryDeploy = true as const;

/**
 * The only seam in this package. Whatever stands up the local station — the
 * Examples dev server, a test double, an overlay host — implements this and
 * hands back two URLs, which are then untrusted until they cross the parser.
 */
export type LocalTempTransport = {
	provision(input: {
		readonly stationId: string;
	}): Promise<{ stationUrl: string; claimUrl: string }>;
};

export type LocalTemporaryStationInput = {
	readonly stationId: string;
	readonly transport?: LocalTempTransport;
};

/** The default transport: a `.hobo.localhost` name, served by nothing yet. */
function builtInTransport(): LocalTempTransport {
	return {
		async provision({ stationId }) {
			const slug =
				stationId
					.toLowerCase()
					.replace(/[^a-z0-9-]/gu, "")
					.slice(-20) || "anon";
			return {
				stationUrl: `https://${slug}.${PROVIDER_TARGET}.hobo.localhost`,
				claimUrl: `https://claim.hobo.localhost/${PROVIDER_TARGET}/${slug}`,
			};
		},
	};
}

/**
 * Provision a temporary/agent Environment Station on the local yard.
 *
 * The result is anonymous and temporary because the endpoint is local and the
 * lease expires, not because this function says so: `deployment` is the parsed
 * pair, and a transport that returned a public host or a URL with userinfo has
 * already failed by the time this returns.
 */
export async function provisionTemporaryEnvironmentStation(
	input: LocalTemporaryStationInput,
): Promise<TemporaryEnvironmentStationResult> {
	const stationId = parseWebernetesStationId(input.stationId);
	const transport = input.transport ?? builtInTransport();
	const deployment: WebernetesStationDeployment =
		parseWebernetesStationDeployment(await transport.provision({ stationId }));
	const expiresAt = temporaryStationExpiresAt(TEMPORARY_STATION_TTL_MS);
	return {
		stationId,
		stationUrl: deployment.station.url,
		primaryUrl: deployment.station.url,
		claimUrl: deployment.claim.url,
		expiresAt,
		ttlSeconds: temporaryStationTtlSeconds(),
		providerId: PROVIDER_TARGET,
		anonymous: true,
		temporary: true,
	};
}
