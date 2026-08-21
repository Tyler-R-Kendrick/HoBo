/**
 * rift isolates the tree; this isolates the command.
 *
 * An agent inside a rift workspace can still name an absolute path, reach the
 * network, or delete things — the filesystem is separated, the process is not.
 * These tests pin what a pane's shell can actually do, and each one is written
 * as an escape attempt rather than a happy path, because the value of the layer
 * is entirely in what it refuses.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	createVirtualShell,
	DEFAULT_COMMANDS,
	DELETION_CAPABLE,
	isAllowed,
	mountFor,
	VIRTUAL_AGENTS,
	VIRTUAL_WORKSPACE,
} from "../src/virtual-shell.js";

const dirs: string[] = [];
afterAll(() => {
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** A workspace with a file inside, and a secret deliberately left outside it. */
function workspace() {
	const parent = mkdtempSync(join(tmpdir(), "vshell-"));
	dirs.push(parent);
	const root = join(parent, "ws");
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(join(root, "src", "app.ts"), "export const answer = 42;\n");
	writeFileSync(join(root, "README.md"), "# project\n");
	const outside = join(parent, "credentials.txt");
	writeFileSync(outside, "AKIA-SUPER-SECRET\n");
	return { root, outside };
}

describe("what the agent can see", () => {
	it("sees the workspace, mounted at a stable path", async () => {
		const { root } = workspace();
		const shell = createVirtualShell({ workspace: root });
		const listed = await shell.run("ls");
		expect(listed.exitCode).toBe(0);
		expect(listed.stdout.split("\n").filter(Boolean).sort()).toEqual([
			"README.md",
			"src",
		]);
		const read = await shell.run("cat src/app.ts");
		expect(read.stdout).toContain("answer = 42");
		expect((await shell.run("pwd")).stdout.trim()).toBe(VIRTUAL_WORKSPACE);
	});

	it("cannot read a file outside the workspace, by any path shape", async () => {
		const { root, outside } = workspace();
		const shell = createVirtualShell({ workspace: root });
		for (const attempt of [
			`cat ${outside}`,
			"cat ../credentials.txt",
			"cat ./../credentials.txt",
			"cat /etc/passwd",
			"cat src/../../credentials.txt",
		]) {
			const run = await shell.run(attempt);
			expect(run.exitCode, attempt).not.toBe(0);
			expect(run.stdout, attempt).not.toContain("AKIA");
		}
		// And the secret is genuinely there to be found, so the test is not
		// passing because the fixture is empty.
		expect(readFileSync(outside, "utf8")).toContain("AKIA");
	});
});

describe("what the agent cannot run", () => {
	it("has no network commands at all", async () => {
		const { root } = workspace();
		const shell = createVirtualShell({ workspace: root });
		for (const attempt of [
			"curl https://example.com",
			"wget https://example.com",
			"nc example.com 80",
		]) {
			const run = await shell.run(attempt);
			// Not "blocked by a rule" — the command does not exist, so there is no
			// rule to forget to write.
			expect(run.refused, attempt).toBe(true);
		}
	});

	it("has no way to spawn or escalate", async () => {
		const { root } = workspace();
		const shell = createVirtualShell({ workspace: root });
		for (const attempt of [
			"sudo ls",
			"ssh box",
			"bash -c 'ls /'",
			"sh -c 'ls /'",
			"node -e 'process.exit(0)'",
			"python3 -c 'print(1)'",
			"git status",
			"chmod 777 README.md",
		]) {
			expect((await shell.run(attempt)).refused, attempt).toBe(true);
		}
	});

	it("has no rm — but find -delete still deletes, and that is documented", async () => {
		const { root } = workspace();
		const shell = createVirtualShell({ workspace: root });
		expect((await shell.run("rm -rf /")).refused).toBe(true);
		expect((await shell.run("rm README.md")).refused).toBe(true);

		// The honest part: `rm` being absent does NOT mean nothing can delete.
		// In the default overlay this removes the in-memory copy only, so the
		// checkout survives — but a reader who assumed "no rm, no deletion"
		// would be wrong, which is why DELETION_CAPABLE names it.
		await shell.run("find . -name README.md -delete");
		expect((await shell.run("ls")).stdout).not.toContain("README.md");
		expect(existsSync(join(root, "README.md"))).toBe(true);
		expect(DELETION_CAPABLE).toContain("find");
	});

	it("find -delete reaches the real file when the shell is writable", async () => {
		// Stated as a test rather than left for someone to discover: `writable`
		// is exported API, and with it the deletion is not confined.
		const { root } = workspace();
		const shell = createVirtualShell({ workspace: root, writable: true });
		await shell.run("find . -name README.md -delete");
		expect(existsSync(join(root, "README.md"))).toBe(false);
	});

	it("honours a narrower allow-list", async () => {
		const { root } = workspace();
		const shell = createVirtualShell({ workspace: root, commands: ["ls"] });
		expect((await shell.run("ls")).exitCode).toBe(0);
		expect((await shell.run("cat README.md")).refused).toBe(true);
		expect(isAllowed("cat", ["ls"])).toBe(false);
		expect(isAllowed("cat")).toBe(true);
	});
});

describe("what the agent writes", () => {
	it("keeps writes off the real tree by default", async () => {
		const { root } = workspace();
		const shell = createVirtualShell({ workspace: root });
		const wrote = await shell.run("echo hello > src/new.ts && cat src/new.ts");
		expect(wrote.exitCode).toBe(0);
		expect(wrote.stdout).toContain("hello");
		// Visible inside the shell, absent from the checkout: promotion is the
		// only path from one to the other.
		expect(existsSync(join(root, "src", "new.ts"))).toBe(false);
	});

	it("persists only when explicitly made writable", async () => {
		const { root } = workspace();
		const shell = createVirtualShell({ workspace: root, writable: true });
		expect((await shell.run("echo persisted > out.txt")).exitCode).toBe(0);
		expect(readFileSync(join(root, "out.txt"), "utf8")).toContain("persisted");
	});

	it("a write outside the root never reaches disk — but it does not fail", async () => {
		// The distinction matters: `/workspace/..` is a *virtual* root, so the
		// write succeeds into memory and returns 0. Nothing escapes, but
		// "no path resolves outside the mounted root" is true of reads only,
		// and an assertion that only checked the disk would pass without
		// establishing that.
		const { root, outside } = workspace();
		const shell = createVirtualShell({ workspace: root, writable: true });
		const absolute = await shell.run(`echo pwned > ${outside}`);
		const relative = await shell.run("echo pwned > ../credentials.txt");
		expect(absolute.exitCode).toBe(0);
		expect(relative.exitCode).toBe(0);
		// …and yet the real file is untouched.
		expect(readFileSync(outside, "utf8")).toContain("AKIA");
		expect(readFileSync(outside, "utf8")).not.toContain("pwned");
	});

	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	it("reports a symlink as a missing file, not as a refusal", async () => {
		// Every dependency in a pnpm workspace is a symlink, so this is the case
		// an agent hits constantly. `ls` still lists the entry — asserting on
		// `ls` would pass regardless — so the assertion is on reading it, which
		// is what actually fails, and on `refused` being false, which is the
		// part that misleads.
		const { root, outside } = workspace();
		symlinkSync(outside, join(root, "link.txt"));
		const shell = createVirtualShell({ workspace: root });
		expect((await shell.run("ls")).stdout).toContain("link.txt");
		const read = await shell.run("cat link.txt");
		expect(read.exitCode).not.toBe(0);
		expect(read.stdout).not.toContain("AKIA");
		// Not "command not found" — so the pane prints no policy line, and the
		// agent sees an ordinary missing file.
		expect(read.refused).toBe(false);
	});
});

describe("what the shell carries", () => {
	it("does not inherit the harness environment", async () => {
		const { root } = workspace();
		process.env.HOBO_TEST_SECRET = "must-not-leak";
		try {
			const shell = createVirtualShell({ workspace: root });
			const env = await shell.run(
				"echo $HOBO_TEST_SECRET; echo $PATH; echo $HOME",
			);
			expect(env.stdout).not.toContain("must-not-leak");
			expect(env.stdout).toContain(VIRTUAL_WORKSPACE);
		} finally {
			process.env.HOBO_TEST_SECRET = undefined;
		}
	});

	it("exposes only declared extra environment", async () => {
		const { root } = workspace();
		const shell = createVirtualShell({
			workspace: root,
			env: { AGENT_ID: "claude" },
		});
		expect((await shell.run("echo $AGENT_ID")).stdout.trim()).toBe("claude");
	});
});

describe("the allow-list is the policy", () => {
	it("grants reading and searching but nothing that leaves the box", () => {
		for (const expected of ["ls", "cat", "grep", "sed", "jq", "diff"]) {
			expect(DEFAULT_COMMANDS).toContain(expected);
		}
		expect(DEFAULT_COMMANDS).toContain("pwd");
		for (const forbidden of [
			"rm",
			"curl",
			"wget",
			"bash",
			"sh",
			"sudo",
			"chmod",
			"git",
		]) {
			expect(DEFAULT_COMMANDS).not.toContain(forbidden);
		}
	});
});

describe("which directory a rift workspace contributes", () => {
	it("mounts the source for an overlay workspace", () => {
		// The overlay tier's merged view exists only inside the namespace
		// `hobo-rift exec` creates. Mounting it from this process yields an empty
		// shell that reports "No such file or directory" for every project file —
		// which is exactly what happened before this rule existed.
		expect(
			mountFor({
				path: "/ws/.hobo-rift/workspaces/a/merged",
				tier: "overlayfs",
				source: "/src",
			}),
		).toBe("/src");
	});

	it("mounts the workspace itself for directory-backed tiers", () => {
		for (const tier of ["reflink", "hardlink", "copy"]) {
			expect(mountFor({ path: "/ws/a", tier, source: "/src" })).toBe("/ws/a");
		}
	});
});

describe("Eve agents in the virtual filesystem", () => {
	it("lists registered Eve trees under /agents without escaping the overlay", async () => {
		const root = mkdtempSync(join(tmpdir(), "hobo-vfs-eve-"));
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(join(root, "src", "app.ts"), "export const n = 1\n");
		mkdirSync(join(root, "agent", "subagents", "implementer"), {
			recursive: true,
		});
		writeFileSync(
			join(root, "agent", "subagents", "implementer", "instructions.md"),
			"write the app\n",
		);
		const secret = join(root, "..", "outside-secret.txt");
		writeFileSync(secret, "AKIA-NOT-IN-VFS\n");
		const shell = createVirtualShell({ workspace: root });
		const listed = await shell.run(
			`ls ${VIRTUAL_AGENTS}/subagents/implementer`,
		);
		expect(listed.exitCode).toBe(0);
		expect(listed.stdout).toMatch(/instructions\.md/);
		const read = await shell.run(
			`cat ${VIRTUAL_AGENTS}/subagents/implementer/instructions.md`,
		);
		expect(read.stdout).toContain("write the app");
		const escaped = await shell.run(`cat ${secret}`);
		expect(escaped.exitCode).not.toBe(0);
		expect(escaped.stdout).not.toContain("AKIA");
	});
});
