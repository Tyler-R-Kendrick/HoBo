import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DockerDriver, IsolatedContainerSpec } from "./docker-driver.js";

const exec = promisify(execFile);

/** Operator-owned Docker engine on a free VM; not invoked from Vercel serverless. */
export function createCliDockerDriver(options: {
	env?: NodeJS.ProcessEnv;
	binary?: string;
}): DockerDriver {
	const docker = options.binary ?? "docker";
	const env = options.env ?? process.env;
	return {
		async create(spec: IsolatedContainerSpec) {
			const args = [
				"create",
				"--name",
				spec.name,
				"--network",
				"bridge",
				"--label",
				"hobo.ci/isolated=1",
				"--label",
				`hobo.ci/timeout-ms=${spec.timeoutMs}`,
			];
			for (const [key, value] of Object.entries(spec.env))
				args.push("-e", `${key}=${value}`);
			args.push(spec.image, ...spec.command);
			const { stdout } = await exec(docker, args, {
				env,
				timeout: 120_000,
				maxBuffer: 1024 * 1024,
			});
			const containerId = stdout.trim();
			if (!/^[a-f0-9]{64}$/.test(containerId))
				throw new Error("invalid container id");
			return { name: spec.name, containerId };
		},
		async start(_name, containerId) {
			await exec(docker, ["start", containerId], { env, timeout: 60_000 });
		},
		async exec(_name, containerId, argv) {
			const { stdout, stderr } = await exec(
				docker,
				["exec", containerId, ...argv],
				{ env, timeout: 3_600_000, maxBuffer: 16 * 1024 * 1024 },
			);
			void stdout;
			void stderr;
			return { exitCode: 0 };
		},
		async stop(_name, containerId) {
			await exec(docker, ["stop", "-t", "30", containerId], {
				env,
				timeout: 120_000,
			});
		},
		async remove(_name, containerId) {
			await exec(docker, ["rm", "-f", containerId], { env, timeout: 120_000 });
		},
	};
}
