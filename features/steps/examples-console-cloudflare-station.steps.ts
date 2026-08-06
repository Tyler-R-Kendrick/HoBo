/**
 * Cucumber steps for features/examples-console-cloudflare-station.feature.
 * Delegates to the Playwright feature runner (same gate as examples:regression).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Given, Then, When, setDefaultTimeout } from "@cucumber/cucumber";

setDefaultTimeout(180_000);

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SCRIPT = path.join(
	REPO_ROOT,
	"site/scripts/examples-console-regression.mts",
);

let featurePassed = false;

async function runPlaywrightFeature(): Promise<void> {
	if (featurePassed) return;
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
