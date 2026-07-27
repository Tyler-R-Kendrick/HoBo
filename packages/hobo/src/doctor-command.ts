import type { CommandModule } from "@hobo/cli";
import { createStationClient, listStationIds } from "@hobo/stations";

import { defaultHoboHome } from "./bare-metal-yard.js";
import {
	type DeployTargetDescription,
	describeDeployTarget,
} from "./deploy-preflight.js";
import { loadHoboProfile } from "./hobo-profile.js";

export interface DoctorCommandDeps {
	// The environment consulted for deploy credentials. Defaults to `process.env`.
	// Injectable so a test can drive every backend lane without mutating the
	// ambient process environment.
	readonly env?: Record<string, string | undefined>;
}

// Turn the deploy-target description into operator-facing remediation lines.
// When already live, there is nothing to remediate; otherwise emit one line per
// real backend naming the exact env var(s) still missing to activate it — this
// is the answer to "how do I go live?" straight from the binary.
function remediationFor(target: DeployTargetDescription): string[] {
	if (target.live) return [];
	return target.activate.map(
		(option) =>
			`Set ${option.missing.join(" + ")} to deploy for real via ${option.backend}.`,
	);
}

// `hobo doctor` — report the deploy target the current environment selects and,
// when on the in-memory fallback, exactly what to set to go live. It calls the
// pure `describeDeployTarget` preflight (presence-only credential inspection),
// so it never reads a secret value and is safe to run anywhere. This makes the
// composed binary self-describing: the same precedence `hobo up` uses is
// surfaced as a diagnostic before anything is deployed.
export function createDoctorCommand(
	deps: DoctorCommandDeps = {},
): CommandModule {
	return {
		run: async ({ emitProgress }) => {
			const env = deps.env ?? process.env;
			const target = describeDeployTarget(env);
			emitProgress(target.summary);

			const hoboHome =
				typeof env.HOBO_HOME === "string" && env.HOBO_HOME.length > 0
					? env.HOBO_HOME
					: defaultHoboHome();
			const profile = loadHoboProfile(hoboHome);
			const stationId =
				(typeof env.HOBO_STATION === "string" && env.HOBO_STATION) ||
				profile?.defaultStation?.id;
			let stationReport: Record<string, unknown> = {
				present: false,
				remediation: "hobo station init",
			};
			if (stationId) {
				try {
					const client = createStationClient({ hoboHome, stationId });
					const occ = client.occupancy();
					if (occ) {
						stationReport = {
							present: true,
							stationId,
							bootstrapActive: occ.bootstrapActive,
							activeRailHash: occ.activeRailHash,
							connectionCount: occ.connectionCount,
							doctorFlag: occ.bootstrapActive
								? "bootstrap-rail-active"
								: undefined,
						};
					}
				} catch {
					stationReport = {
						present: false,
						stationId,
						remediation: "hobo station init",
					};
				}
			} else {
				const ids = listStationIds(hoboHome);
				if (ids.length > 0) {
					stationReport = {
						present: true,
						stationIds: ids,
						remediation: "set profile.defaultStation or HOBO_STATION",
					};
				}
			}

			const remediation = remediationFor(target);
			if (!stationReport.present) {
				remediation.push("Run `hobo station init` for Station occupancy setup.");
			} else if (stationReport.bootstrapActive === true) {
				remediation.push(
					"Bootstrap Rail still active — publish/activate a non-bootstrap Rail for production posture.",
				);
			}

			return {
				ok: true,
				status: target.live ? "live" : "in-memory",
				code: target.live ? "HOBO_DEPLOY_LIVE" : "HOBO_DEPLOY_MOCKED",
				message: target.summary,
				...(remediation.length > 0 ? { remediation } : {}),
				data: {
					command: "doctor",
					backend: target.backend,
					live: target.live,
					activate: target.activate,
					station: stationReport,
				},
			};
		},
	};
}
