import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { cleanup, startBrowserJourney } from "./implementations.ts";
import { createWorld } from "./world.ts";

const output = process.env.OUT_DIR;
if (!output) throw new Error("OUT_DIR is required");
mkdirSync(output, { recursive: true });

const require = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = require("playwright") as typeof import("playwright");
const world = createWorld();
await startBrowserJourney(world);
if (!world.browser) throw new Error("browser server did not start");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
	viewport: { width: 1280, height: 720 },
	recordVideo: { dir: output, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
const dialogs: string[] = [];
page.on("dialog", (dialog) => dialog.accept(dialogs.shift() ?? ""));
const pause = () => page.waitForTimeout(600);

try {
	await page.goto(world.browser.server.url);
	await page.fill("#name", "Release orchestration");
	await page.fill("#branch", "code/release-orchestration");
	await page.click("#create button");
	await page.waitForSelector(".session");
	await pause();

	dialogs.push("Review");
	await page.click('[data-action="create-tab"]');
	await pause();
	if ((await page.locator("h3", { hasText: "Review" }).count()) === 0)
		throw new Error(
			`new tab failed: ${await page.locator("#result").textContent()}`,
		);

	dialogs.push("Observer", "");
	await page.locator('[data-action="create-pane"]').last().click();
	await pause();
	if ((await page.locator("strong", { hasText: "Observer" }).count()) === 0)
		throw new Error(
			`new pane failed: ${await page.locator("#result").textContent()}`,
		);

	await page.locator('[data-action="focus-pane"]').first().click();
	dialogs.push("continue the release review");
	await page.locator('[data-action="prompt-pane"]').first().click();
	await pause();

	dialogs.push("before delivery");
	await page.click('[data-action="create-checkpoint"]');
	await pause();
	if (
		(await page
			.locator(".checkpoints", { hasText: "before delivery" })
			.count()) === 0
	)
		throw new Error(
			`checkpoint failed: ${await page.locator("#result").textContent()}`,
		);

	await page.click('[data-action="detach"]');
	await page
		.locator(".session .muted", { hasText: "This browser is detached" })
		.waitFor();
	await page.screenshot({ path: path.join(output, "frame-000.png") });
	await page.waitForTimeout(1_200);
	await page.click('[data-action="reattach"]');
	await page.waitForSelector('[data-action="stop-session"]');
	await pause();
	dialogs.push("");
	await page.click('[data-action="stop-session"]');
	await pause();
} finally {
	await context.close();
	await browser.close();
	await cleanup(world);
}
