import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { createLocalReviewControl } from "../src/review/local-review-control.js";
import {
	REVIEW_BROWSER_CSP,
	reviewBrowserHtml,
} from "../src/review/review-browser-assets.js";
import { reviewBrowserControllerScript } from "../src/review/review-browser-controller.js";
import { reviewBrowserViewScript } from "../src/review/review-browser-view.js";
import { createMemoryReviewDiffSource } from "../src/review/review-generations.js";
import { startReviewControlServer } from "../src/review/review-http-routes.js";
import { REVIEW_COMMAND_SCHEMA } from "../src/review/review-ports.js";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function temp(prefix: string): string {
	const root = mkdtempSync(join(tmpdir(), prefix));
	roots.push(root);
	return root;
}

const XSS_PATH = "<img src=x onerror=alert(1)>";
const XSS_BODY = "<script>window.__xss=1</script><img src=x onerror=alert(1)>";
const TOKEN = "browser-security-token";

function envelope(
	reviewId: string,
	commandId: string,
	revision: string,
	command: Record<string, unknown>,
) {
	return {
		schemaVersion: REVIEW_COMMAND_SCHEMA,
		commandId,
		actorId: "browser-test",
		reviewId,
		expectedRevision: revision,
		command,
	};
}

describe("review browser security", () => {
	it("keeps provider HTML inert and never stores review truth in localStorage", async () => {
		const script = `${reviewBrowserViewScript()}\n${reviewBrowserControllerScript()}`;
		expect(script).not.toMatch(
			/innerHTML|outerHTML|insertAdjacentHTML|document\.write/u,
		);
		expect(script).not.toMatch(/localStorage/u);
		expect(REVIEW_BROWSER_CSP).toContain("default-src 'self'");
		expect(REVIEW_BROWSER_CSP).toContain("frame-ancestors 'none'");
		const html = reviewBrowserHtml({ token: TOKEN });
		expect(html).not.toMatch(/href="[^"]*token=/u);
		expect(html).not.toContain("innerHTML");

		const hoboHome = temp("hobo-review-xss-");
		const diffSource = createMemoryReviewDiffSource();
		diffSource.stageFiles([
			{ path: XSS_PATH, oldText: "x\n", newText: `${XSS_BODY}\n` },
			{ path: "safe.ts", oldText: "ok\n", newText: "OK\n" },
		]);
		const control = createLocalReviewControl({ hoboHome, diffSource });
		const server = await startReviewControlServer({
			hoboHome,
			token: TOKEN,
			control,
			diffSource,
		});
		const origin = `http://127.0.0.1:${server.port}`;
		const headers = {
			authorization: `Bearer ${TOKEN}`,
			"content-type": "application/json",
			origin,
		};
		try {
			const started = await fetch(`${origin}/api/reviews/commands`, {
				method: "POST",
				headers,
				body: JSON.stringify(
					envelope("review-xss", "cmd-start", "0", {
						kind: "start-review",
						sessionId: "session-xss",
						target: {
							kind: "commit",
							repositoryId: "repo-1",
							repositoryRoot: "/tmp/hobo-secret-repo",
							parentCommitOid: "a".repeat(40),
							commitOid: "b".repeat(40),
						},
					}),
				),
			});
			const startedBody = (await started.json()) as { revision: string };
			await fetch(`${origin}/api/reviews/commands`, {
				method: "POST",
				headers,
				body: JSON.stringify(
					envelope("review-xss", "cmd-thread", startedBody.revision, {
						kind: "create-thread",
						body: XSS_BODY,
						visibility: "session",
					}),
				),
			});

			const queryAuth = await fetch(`${origin}/reviews?token=${TOKEN}`);
			expect(queryAuth.status).toBe(401);

			const browser = await chromium.launch({ headless: true });
			try {
				const page = await browser.newPage();
				page.setDefaultTimeout(4_000);
				const dialogs: string[] = [];
				page.on("dialog", (dialog) => {
					dialogs.push(dialog.message());
					return dialog.dismiss();
				});
				await page.setExtraHTTPHeaders({ authorization: `Bearer ${TOKEN}` });
				await page.goto(`${origin}/reviews`);
				await page.locator("[data-review-file]").first().waitFor();
				expect(page.url()).not.toContain(TOKEN);
				expect(page.url()).not.toContain("token=");
				expect(await page.locator("#files img").count()).toBe(0);
				expect(await page.locator("#threads script").count()).toBe(0);
				expect(await page.locator("#files").innerText()).toContain("<img");
				expect(await page.locator("#threads").innerText()).toContain(
					"<script>",
				);
				expect(
					await page.evaluate(() => (window as { __xss?: number }).__xss),
				).toBeUndefined();
				expect(dialogs).toEqual([]);
				expect(await page.evaluate(() => localStorage.length)).toBe(0);
				const stored = await page.evaluate(() =>
					Object.keys(sessionStorage).filter((key) =>
						key.toLowerCase().includes("review"),
					),
				);
				expect(stored).toEqual([]);
			} finally {
				await browser.close();
			}
		} finally {
			await server.close();
			control.close();
		}
	});
});
