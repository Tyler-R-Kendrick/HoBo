/**
 * Cucumber steps for features/examples-console-cloudflare-station.feature.
 * Delegates to the Playwright feature runner (same gate as examples:regression).
 * The runner needs `astro dev` serving EXAMPLES_BASE_URL; these steps boot it
 * themselves (and tear it down) when nothing is already listening, so the
 * behavior lane passes on a cold checkout instead of requiring a manually
 * started dev server.
 */
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AfterAll, Given, Then, When, setDefaultTimeout } from "@cucumber/cucumber";

setDefaultTimeout(300_000);

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SCRIPT = path.join(
	REPO_ROOT,
	"site/scripts/examples-console-regression.mts",
);
const BASE_URL = process.env.EXAMPLES_BASE_URL ?? "http://127.0.0.1:4321/HoBo/";
const HEALTH_URL = new URL("api/cf-temp", BASE_URL).toString();

let featurePassed = false;
let devServer: ChildProcess | undefined;
let devServerFailure = "";

const execFileAsync = promisify(execFile);

async function healthOk(): Promise<boolean> {
	try {
		const response = await fetch(HEALTH_URL);
		return response.ok;
	} catch {
		return false;
	}
}

async function ensureDevServer(): Promise<void> {
	if (await healthOk()) return;
	if (!devServer) {
		try {
			await execFileAsync(
				"pnpm",
				[
					"--filter",
					"@hobo/wasp",
					"--filter",
					"@hobo/convex",
					"--filter",
					"@hobo/provider-convex",
					"build",
				],
				{ cwd: REPO_ROOT, env: process.env, timeout: 180_000 },
			);
		} catch (error) {
			throw new Error(`site dependency build failed: ${String(error)}`);
		}
		devServer = spawn("pnpm", ["--filter", "hobo-site", "run", "dev"], {
			cwd: REPO_ROOT,
			env: process.env,
			stdio: ["ignore", "pipe", "pipe"],
			detached: true,
		});
		const collect = (chunk: Buffer) => {
			devServerFailure = `${devServerFailure}${chunk.toString("utf8")}`.slice(
				-4000,
			);
		};
		devServer.stdout?.on("data", collect);
		devServer.stderr?.on("data", collect);
		devServer.on("error", (error) => {
			devServerFailure = String(error);
			devServer = undefined;
		});
		devServer.on("exit", (code, signal) => {
			devServerFailure =
				devServerFailure || `astro dev exited ${code ?? signal ?? "unknown"}`;
			devServer = undefined;
		});
	}
	const deadline = Date.now() + 120_000;
	while (Date.now() < deadline) {
		if (await healthOk()) return;
		if (!devServer) {
			throw new Error(`astro dev failed to start: ${devServerFailure}`);
		}
		await new Promise((resolveSleep) => setTimeout(resolveSleep, 1_000));
	}
	throw new Error(
		`astro dev never became healthy at ${HEALTH_URL} within 120s — start it manually with \`pnpm --filter hobo-site run dev\``,
	);
}

AfterAll(() => {
	if (devServer?.pid !== undefined) {
		try {
			process.kill(-devServer.pid, "SIGTERM");
		} catch {
			devServer.kill("SIGTERM");
		}
	}
});

async function runPlaywrightFeature(): Promise<void> {
	if (featurePassed) return;
	await ensureDevServer();
	await new Promise<void>((resolve, reject) => {
		const child = spawn(process.execPath, ["--import", "tsx", SCRIPT], {
			cwd: REPO_ROOT,
			env: process.env,
			stdio: "inherit",
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				featurePassed = true;
				resolve();
				return;
			}
			reject(new Error(`examples-console Playwright feature exited ${code}`));
		});
	});
}

Given(
	"yard deploy surfaces forbid waspApp cli and Bindle app packaging",
	async () => {
		await runPlaywrightFeature();
	},
);

Given("the examples console is open on the static site", async () => {
	await runPlaywrightFeature();
});

When("the operator selects the Cloudflare yard", async () => {
	await runPlaywrightFeature();
});

Then("Stage Source shows the Cloudflare stationBootstrap surface", async () => {
	await runPlaywrightFeature();
});

When("the operator deploys stations for Cloudflare", async () => {
	await runPlaywrightFeature();
});

Then("an anonymous Cloudflare Environment Station is ready", async () => {
	await runPlaywrightFeature();
});

Then(
	"an anonymous Cloudflare Environment Station is ready on workers.dev",
	async () => {
		await runPlaywrightFeature();
	},
);

Then(
	"Playwright can navigate to the station URL and read health",
	async () => {
		await runPlaywrightFeature();
	},
);

Then("Ship is unlocked without requiring examples:bridge", async () => {
	await runPlaywrightFeature();
});
