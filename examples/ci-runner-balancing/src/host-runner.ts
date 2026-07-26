/**
 * Last-resort host runner: turns the machine that requested CI into an
 * ephemeral self-hosted GitHub Actions runner serving the
 * `hobo-last-resort` label, so a track failed over by the dispatcher can
 * still execute when every hosted provider is blocked (spending limit,
 * exhausted minutes, outage). Ephemeral registration deregisters after
 * each job; the drain loop re-registers while queued work remains.
 *
 * This module holds the pure, testable pieces (asset selection, config
 * arguments, drain policy, API URLs); the process/network shell lives in
 * src/bin/host-runner.ts. Security posture: a registered runner executes
 * repository workflow code on this machine — intended for the repo's own
 * developers/agents on their own branches, never for untrusted forks.
 */

export interface RunnerAsset {
	os: string;
	architecture: string;
	download_url: string;
	filename: string;
}

/** Map a Node platform/arch pair onto GitHub's runner download matrix. */
export function pickRunnerAsset(
	assets: readonly RunnerAsset[],
	platform: NodeJS.Platform,
	arch: string,
): RunnerAsset | undefined {
	const os =
		platform === "linux" ? "linux" : platform === "darwin" ? "osx" : undefined;
	const architecture = arch === "x64" ? "x64" : arch === "arm64" ? "arm64" : undefined;
	if (os === undefined || architecture === undefined) return undefined;
	return assets.find(
		(asset) => asset.os === os && asset.architecture === architecture,
	);
}

export interface RunnerConfig {
	repoUrl: string;
	token: string;
	name: string;
	labels: readonly string[];
}

/** Arguments for actions/runner config.sh — ephemeral, unattended, no self-update. */
export function runnerConfigArgs(config: RunnerConfig): string[] {
	return [
		"--unattended",
		"--ephemeral",
		"--disableupdate",
		"--url",
		config.repoUrl,
		"--token",
		config.token,
		"--name",
		config.name,
		"--labels",
		config.labels.join(","),
	];
}

export interface DrainState {
	queued: number;
	iteration: number;
	maxIterations: number;
	once: boolean;
}

/**
 * Keep serving while queued work remains. The first iteration always runs
 * (a fail-over flip may not have produced queued jobs yet when the human
 * starts the host runner); later iterations stop on an empty queue, the
 * iteration cap, or --once.
 */
export function shouldServeAnotherJob(state: DrainState): boolean {
	if (state.iteration >= state.maxIterations) return false;
	if (state.once) return state.iteration === 0;
	if (state.iteration === 0) return true;
	return state.queued > 0;
}

export function registrationTokenPath(owner: string, repo: string): string {
	return `/repos/${owner}/${repo}/actions/runners/registration-token`;
}

export function runnerDownloadsPath(owner: string, repo: string): string {
	return `/repos/${owner}/${repo}/actions/runners/downloads`;
}

export function queuedRunsPath(owner: string, repo: string): string {
	return `/repos/${owner}/${repo}/actions/runs?status=queued&per_page=25`;
}
