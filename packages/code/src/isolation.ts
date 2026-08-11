import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import { matrixForPlatform } from "./platform-matrix.js";
import {
	CODE_ISOLATION_SCHEMA,
	type HandbackReport,
	type IsolationBackend,
	type IsolationContext,
} from "./types.js";

export interface CreateIsolationOptions {
	readonly projectRoot: string;
	/** HOBO_HOME or temp; sandboxes live under sandboxes/<runId>. */
	readonly hoboHome: string;
	readonly runId?: string;
	readonly branch?: string;
	readonly stationId?: string;
	/** Prefer rift when CoW probe succeeds (default true). */
	readonly preferRift?: boolean;
	/** Force worktree (CI / tests). */
	readonly forceWorktree?: boolean;
	/** Injected rift availability probe. */
	readonly riftAvailable?: () => boolean;
	/** Injected worktree creator (defaults to git worktree add). */
	readonly createWorktree?: (input: {
		root: string;
		branch: string;
		projectRoot: string;
	}) => void | Promise<void>;
}

/**
 * Async git runner — isolation setup/teardown must never block the event
 * loop: the InteractiveShell keeps rendering while a dispatch turn runs.
 */
function runGit(
	args: readonly string[],
	cwd: string,
): Promise<{ readonly status: number | null }> {
	return new Promise((resolvePromise) => {
		const child = spawn("git", [...args], { cwd, stdio: "ignore" });
		child.on("error", () => resolvePromise({ status: null }));
		child.on("exit", (code) => resolvePromise({ status: code }));
	});
}

const openContexts = new Map<string, IsolationContext>();

function defaultRiftProbe(): boolean {
	// Rift is experimental and never vendored. Presence is signaled only when
	// HOBO_RIFT=1 and platform is CoW-capable. Default off for CI determinism.
	if (process.env.HOBO_RIFT !== "1") return false;
	if (process.platform === "win32") return false;
	return process.env.HOBO_RIFT_COW === "1";
}

async function defaultCreateWorktree(input: {
	root: string;
	branch: string;
	projectRoot: string;
}): Promise<void> {
	mkdirSync(input.root, { recursive: true });
	// Prefer real git worktree when project is a git repo; otherwise mediated copy stub.
	const isGit = existsSync(join(input.projectRoot, ".git"));
	if (isGit) {
		const add = await runGit(
			["worktree", "add", "-b", input.branch, input.root, "HEAD"],
			input.projectRoot,
		);
		if (add.status === 0) return;
		throw new Error(
			`git worktree add failed for ${input.branch}; no shared fallback was created`,
		);
	}
	mkdirSync(input.root, { recursive: true });
	writeFileSync(
		join(input.root, ".hobo-mediated-view.json"),
		JSON.stringify(
			{
				schema: CODE_ISOLATION_SCHEMA,
				projectRoot: input.projectRoot,
				branch: input.branch,
				mediated: true,
				writable: true,
				canonicalWritable: false,
			},
			null,
			2,
		),
		"utf8",
	);
}

function selectBackend(options: CreateIsolationOptions): IsolationBackend {
	const matrix = matrixForPlatform();
	const forceWorktree =
		options.forceWorktree === true || process.env.CI === "true";
	const preferRift = options.preferRift !== false;
	const riftProbe = options.riftAvailable ?? defaultRiftProbe;
	if (!forceWorktree && preferRift && riftProbe()) {
		return {
			kind: "rift",
			platform: process.platform,
			cowCapable: true,
			reason: "rift available and CoW probe succeeded",
		};
	}
	return {
		kind: "worktree",
		platform: process.platform,
		cowCapable: matrix.cowCapable,
		reason: forceWorktree
			? "CI/forceWorktree selects classical worktree"
			: "rift unavailable; first-class worktree fallback",
	};
}

/**
 * Create an isolated agent context: rift preferred, worktree fallback.
 * Canonical projectRoot stays read-only for agent mode (mediatedOnly: true).
 */
export async function createIsolationContext(
	options: CreateIsolationOptions,
): Promise<IsolationContext> {
	const runId =
		options.runId ??
		`run-${createHash("sha256").update(randomUUID()).digest("hex").slice(0, 12)}`;
	const branch = options.branch ?? `code/${runId}`;
	const backend = selectBackend(options);
	const sandboxesRoot = join(options.hoboHome, "sandboxes");
	const durableRoot = join(options.hoboHome, "durable", "code", runId);
	const rootPath = resolve(join(sandboxesRoot, runId));
	mkdirSync(durableRoot, { recursive: true });
	mkdirSync(sandboxesRoot, { recursive: true });

	if (backend.kind === "rift") {
		// Rift root is a CoW clone placeholder; never vendor anomalyco/rift into the repo.
		mkdirSync(rootPath, { recursive: true });
		writeFileSync(
			join(rootPath, ".hobo-rift.json"),
			JSON.stringify(
				{
					schema: CODE_ISOLATION_SCHEMA,
					backend: "rift",
					projectRoot: options.projectRoot,
					branch,
					mediated: true,
				},
				null,
				2,
			),
			"utf8",
		);
	} else {
		const createWt = options.createWorktree ?? defaultCreateWorktree;
		await createWt({
			root: rootPath,
			branch,
			projectRoot: options.projectRoot,
		});
	}

	const ctx: IsolationContext = {
		schemaVersion: CODE_ISOLATION_SCHEMA,
		runId,
		branch,
		rootPath,
		backend,
		...(options.stationId !== undefined
			? { stationId: options.stationId }
			: {}),
		durableRoot,
		createdAt: new Date().toISOString(),
		status: "open",
		projectRoot: resolve(options.projectRoot),
		mediatedOnly: true,
	};
	openContexts.set(runId, ctx);
	writeFileSync(
		join(durableRoot, "isolation.json"),
		JSON.stringify(ctx, null, 2),
		"utf8",
	);
	return ctx;
}

export interface CleanupResult {
	readonly status: "cleaned";
	readonly orphans: readonly string[];
	readonly handback: HandbackReport;
}

/**
 * Mandatory cleanup on every exit path. Durable learning artifacts outside
 * the ephemeral root are preserved.
 */
export async function cleanupIsolation(
	runId: string,
	options: {
		readonly hoboHome: string;
		readonly ok?: boolean;
		readonly gates?: readonly string[];
		readonly removeBranch?: (branch: string) => void | Promise<void>;
	},
): Promise<CleanupResult> {
	const sandboxesRoot = join(options.hoboHome, "sandboxes");
	const rootPath = join(sandboxesRoot, runId);
	const durableRoot = join(options.hoboHome, "durable", "code", runId);
	const prior = openContexts.get(runId);
	const branch = prior?.branch ?? `code/${runId}`;

	// Inverse of setup: remove ephemeral root; never touch durableRoot learning.
	if (existsSync(rootPath)) {
		// Prefer git worktree remove when applicable.
		if (prior?.projectRoot && existsSync(join(prior.projectRoot, ".git"))) {
			await runGit(
				["worktree", "remove", "--force", rootPath],
				prior.projectRoot,
			);
			await runGit(["worktree", "prune"], prior.projectRoot);
		}
		rmSync(rootPath, { recursive: true, force: true });
	}

	if (options.removeBranch) {
		await options.removeBranch(branch);
	} else if (
		prior?.projectRoot &&
		existsSync(join(prior.projectRoot, ".git"))
	) {
		await runGit(["branch", "-D", branch], prior.projectRoot);
	}

	const orphans: string[] = [];
	if (existsSync(rootPath)) orphans.push(rootPath);

	const handback: HandbackReport = {
		runId,
		ok: options.ok !== false && orphans.length === 0,
		branch,
		gates: options.gates ?? [],
		isolationStatus: "cleaned",
		orphans,
		message:
			orphans.length === 0
				? `isolation ${runId} cleaned; durable learning retained at ${durableRoot}`
				: `isolation ${runId} cleanup incomplete: ${orphans.join(", ")}`,
	};

	mkdirSync(durableRoot, { recursive: true });
	writeFileSync(
		join(durableRoot, "handback.json"),
		JSON.stringify(handback, null, 2),
		"utf8",
	);

	const cleaned: IsolationContext | undefined = prior
		? { ...prior, status: "cleaned" }
		: undefined;
	if (cleaned) openContexts.set(runId, cleaned);
	else openContexts.delete(runId);

	return { status: "cleaned", orphans, handback };
}

/** Assert no open sandbox dirs remain under hoboHome/sandboxes. */
export function listSandboxOrphans(hoboHome: string): readonly string[] {
	const sandboxesRoot = join(hoboHome, "sandboxes");
	if (!existsSync(sandboxesRoot)) return [];
	return readdirSync(sandboxesRoot).map((name) => join(sandboxesRoot, name));
}

export function getOpenIsolation(runId: string): IsolationContext | undefined {
	return openContexts.get(runId);
}

/** Test helper: reset in-memory registry. */
export function resetIsolationRegistry(): void {
	openContexts.clear();
}

export function readHandback(
	hoboHome: string,
	runId: string,
): HandbackReport | null {
	const path = join(hoboHome, "durable", "code", runId, "handback.json");
	if (!existsSync(path)) return null;
	return JSON.parse(readFileSync(path, "utf8")) as HandbackReport;
}
