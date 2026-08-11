import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createLocalSessionControl } from "../../../src/local-session-control.js";
import { type MuxRunner, tmuxRunner } from "../../../src/mux.js";
import { runResidentSessionCli } from "../../../src/resident-session-cli.js";
import { residentSessionTmuxName } from "../../../src/resident-session-runtime.js";
import { startSessionControlServer } from "../../../src/session-control-server.js";

const scenario = process.argv[2];
const output = process.argv[3];
if (!scenario || !output)
	throw new Error("usage: replay.playwright.ts <scenario> <output.webm>");
const native = scenario === "tmux-attachment-includes-a-native-git-window";

function git(cwd: string, args: readonly string[]): string {
	const result = spawnSync("git", [...args], { cwd, encoding: "utf8" });
	if (result.status !== 0) throw new Error(result.stderr);
	return result.stdout;
}

function fakeTmux(): MuxRunner {
	let pane = 0;
	let exists = false;
	return {
		async run(args) {
			if (args[0] === "capture-pane")
				return { code: 0, stdout: "agent harness ready\n" };
			if (args[0] === "has-session")
				return { code: exists ? 0 : 1, stdout: "" };
			if (
				["new-session", "new-window", "split-window"].includes(args[0] ?? "")
			) {
				exists = true;
				return { code: 0, stdout: `%${++pane}\n` };
			}
			if (args[0] === "kill-session") exists = false;
			return { code: 0, stdout: "" };
		},
	};
}

const root = mkdtempSync(join(tmpdir(), "hobo-code-git-replay-"));
const repository = join(root, "repo");
const hoboHome = join(root, "home");
const videoDirectory = join(root, "video");
mkdirSync(repository);
mkdirSync(videoDirectory);
git(repository, ["init", "-q", "-b", "main"]);
git(repository, ["config", "user.email", "evidence@example.com"]);
git(repository, ["config", "user.name", "HoBo Evidence"]);
writeFileSync(join(repository, "README.md"), "# Replay\n");
git(repository, ["add", "README.md"]);
git(repository, ["commit", "-qm", "base"]);

const control = createLocalSessionControl({
	hoboHome,
	...(native ? {} : { tmux: fakeTmux() }),
});
const server = await startSessionControlServer({
	hoboHome,
	projectRoot: repository,
	token: "evidence-token",
	control,
});
const headers = {
	authorization: "Bearer evidence-token",
	"content-type": "application/json",
};
const createResponse = await fetch(
	`http://127.0.0.1:${server.port}/code/commands`,
	{
		method: "POST",
		headers,
		body: JSON.stringify({
			command: {
				schemaVersion: "hobo.code.session-command/v1",
				commandId: "evidence-create",
				actorId: "browser-evidence",
				sessionId: "git-evidence",
				expectedRevision: "0",
				createSession: {
					name: "Lazygit parity gauntlet",
					projectRoot: repository,
					branch: "code/git-evidence",
					clientId: "browser-evidence",
				},
			},
		}),
	},
);
if (!createResponse.ok) throw new Error(await createResponse.text());
const created = (await createResponse.json()) as {
	session: { worktreePath: string };
};
const worktree = created.session.worktreePath;
writeFileSync(join(worktree, "stashed.txt"), "stash preview\n");
git(worktree, ["add", "stashed.txt"]);
git(worktree, ["stash", "push", "-m", "evidence stash"]);
writeFileSync(join(worktree, "README.md"), "# Replay\n\nworkbench change\n");
writeFileSync(join(worktree, "new-file.txt"), "new work\n");
writeFileSync(join(worktree, "ignore-me.log"), "local output\n");
git(worktree, ["add", "new-file.txt"]);

const browser = await chromium.launch({ headless: true });
try {
	const narrow = scenario === "narrow-terminals-keep-the-workflow-reachable";
	const context = await browser.newContext({
		viewport: narrow
			? { width: 390, height: 844 }
			: { width: 1440, height: 1_000 },
		recordVideo: {
			dir: videoDirectory,
			size: narrow
				? { width: 390, height: 844 }
				: { width: 1_440, height: 1_000 },
		},
	});
	await context.addInitScript(() => {
		sessionStorage.hoboCodeClientId = "browser-evidence";
	});
	const page = await context.newPage();
	const video = page.video();
	if (native) {
		process.env.HOBO_CODE_BIN = join(
			dirname(fileURLToPath(import.meta.url)),
			"../../../dist/bin/hobo-code.js",
		);
		await runResidentSessionCli({
			args: ["attach", "git-evidence"],
			hoboHome,
			projectDir: repository,
			approved: false,
			actorId: "native-evidence",
		});
		const tmux = tmuxRunner();
		await tmux.run([
			"resize-window",
			"-t",
			residentSessionTmuxName("git-evidence"),
			"-x",
			"80",
			"-y",
			"24",
		]);
		let paneId = "";
		let frame = "";
		for (let attempt = 0; attempt < 30; attempt += 1) {
			const snapshot = await control.load("git-evidence");
			for (const pane of snapshot?.panes ?? []) {
				if (
					(await control.runtime.paneRole("git-evidence", pane.id)) ===
					"hobo-code.git-workbench"
				) {
					paneId = pane.runtimeId;
					frame = await control.capturePane("git-evidence", pane.id, 30);
				}
			}
			if (frame.includes("hobo-code · Git ·")) break;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		if (!paneId || !frame.includes("hobo-code · Git ·")) {
			throw new Error("native Git pane did not become ready");
		}
		await page.setContent(
			`<style>body{margin:0;background:#050708;color:#f4f0e8}pre{font:22px/1.15 monospace;white-space:pre;margin:24px}</style><pre></pre>`,
		);
		await page.locator("pre").evaluate((element, text) => {
			element.textContent = text;
		}, frame);
		await page.waitForTimeout(1_500);
		const commitKey = await tmux.run([
			"send-keys",
			"-t",
			paneId,
			"-l",
			"--",
			"c",
		]);
		if (commitKey.code !== 0) throw new Error(commitKey.stderr);
		await page.waitForTimeout(800);
		const promptFrame = await tmux.run([
			"capture-pane",
			"-p",
			"-S",
			"-30",
			"-t",
			paneId,
		]);
		if (!promptFrame.stdout.includes("Commit message:")) {
			throw new Error(
				`native commit prompt did not open:\n${promptFrame.stdout}`,
			);
		}
		await tmux.run([
			"send-keys",
			"-t",
			paneId,
			"-l",
			"--",
			"Evidence staged-only commit",
		]);
		await tmux.run(["send-keys", "-t", paneId, "Enter"]);
		await page.waitForTimeout(1_500);
		const approvalFrame = await tmux.run([
			"capture-pane",
			"-p",
			"-S",
			"-30",
			"-t",
			paneId,
		]);
		if (!approvalFrame.stdout.includes("Exact effect:")) {
			throw new Error(
				`native Git pane did not render the approval challenge:\n${approvalFrame.stdout}`,
			);
		}
		await page.locator("pre").evaluate((element, text) => {
			element.textContent = text;
		}, approvalFrame.stdout);
		await page.waitForTimeout(1_500);
	} else {
		await page.goto(server.url);
		await page.getByRole("tab", { name: "Git" }).waitFor();
	}

	if (native) {
		// The frame above is produced by the same pure renderer used in tmux.
	} else if (scenario === "git-stays-adjacent-to-terminal-tabs") {
		await page.getByRole("tab", { name: "Git" }).click();
		await page.locator(".git-workbench").waitFor();
		await page.waitForTimeout(1_000);
		await page.getByRole("tab", { name: "main" }).click();
		await page.waitForTimeout(700);
		await page.getByRole("tab", { name: "Git" }).click();
		await page.waitForTimeout(1_000);
	} else {
		await page.getByRole("tab", { name: "Git" }).click();
		await page.locator(".git-workbench").waitFor();
		if (
			scenario ===
			"keyboard-review-and-staging-follows-the-lazygit-mental-model"
		) {
			for (const key of ["1", "2", "3", "4", "5", "2", "j", "k", "2"]) {
				await page.keyboard.press(key);
				await page.waitForTimeout(350);
			}
			await page.keyboard.press("Space");
			await page.waitForTimeout(900);
			await page.keyboard.press("Space");
			await page.waitForTimeout(1_000);
		} else if (
			scenario === "core-repository-operations-stay-in-the-workbench"
		) {
			await page.evaluate(() => {
				window.confirm = () => true;
			});
			await page.keyboard.press("2");
			await page.getByRole("button", { name: /ignore-me\.log/u }).click();
			await page.locator('[data-action="git-ignore"]').click();
			await page.waitForTimeout(800);
			await page.keyboard.press("3");
			await page.waitForTimeout(500);
			await page.evaluate(() => {
				window.prompt = () => "code/evidence-created";
			});
			await page.locator('[data-action="git-new-branch"]').click();
			await page.waitForTimeout(1_000);
			await page.evaluate(() => {
				window.prompt = () => "evidence stash from workbench";
			});
			await page.locator('[data-action="git-stash-create"]').click();
			await page.waitForTimeout(1_000);
			await page.keyboard.press("5");
			await page.waitForTimeout(700);
		} else if (scenario === "delivery-stays-on-hobo-approval-rails") {
			await page.evaluate(() => {
				window.prompt = () => "Evidence staged-only commit";
				window.confirm = () => false;
			});
			await page.locator('[data-action="git-commit"]').click();
			await page.locator("#result").getByText("Approval required").waitFor();
			await page.locator("#result").scrollIntoViewIfNeeded();
			await page.waitForTimeout(1_500);
		} else if (narrow) {
			await page.locator(".git-main").scrollIntoViewIfNeeded();
			await page.waitForTimeout(900);
			const firstAction = page.locator(
				'.git-actions [data-action="git-stage"]',
			);
			await firstAction.focus();
			for (let index = 0; index < 17; index += 1) {
				await page.keyboard.press("Tab");
				await page.waitForTimeout(120);
			}
		} else throw new Error(`unknown scenario: ${scenario}`);
	}
	await page.close();
	const recorded = await video?.path();
	await context.close();
	if (!recorded) throw new Error("Playwright did not produce a video");
	copyFileSync(recorded, output);
} finally {
	await browser.close();
	const live = await control.load("git-evidence").catch(() => undefined);
	if (native && live) {
		await control.runtime
			.stop("git-evidence", live.revision ?? 0n)
			.catch(() => undefined);
	}
	await server.close();
	rmSync(root, { recursive: true, force: true });
}
