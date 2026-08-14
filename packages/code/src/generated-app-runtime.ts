import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Generated hello-world apps declare workspace:* deps they cannot resolve
 * until someone runs pnpm install. Link the monorepo packages so `hobo dev`
 * can import `src/bindle.ts` immediately.
 */
export function linkGeneratedAppRuntime(
	projectDir: string,
	from: string = dirname(fileURLToPath(import.meta.url)),
): void {
	const repoRoot = findRepoRoot(from);
	if (repoRoot === undefined) return;
	const hoboNm = join(projectDir, "node_modules", "@hobo");
	mkdirSync(hoboNm, { recursive: true });
	const links: ReadonlyArray<readonly [string, string]> = [
		["adapter-hono", join(repoRoot, "packages", "adapters", "adapter-hono")],
		["bindles", join(repoRoot, "packages", "bindles")],
		["core", join(repoRoot, "packages", "core")],
	];
	for (const [name, target] of links) {
		if (!existsSync(target)) continue;
		const dest = join(hoboNm, name);
		if (existsSync(dest)) continue;
		symlinkSync(target, dest, "dir");
	}
	const honoDest = join(projectDir, "node_modules", "hono");
	if (!existsSync(honoDest)) {
		const hono = firstExisting([
			join(repoRoot, "node_modules", "hono"),
			join(repoRoot, "packages", "adapters", "adapter-hono", "node_modules", "hono"),
		]);
		if (hono !== undefined) {
			mkdirSync(join(projectDir, "node_modules"), { recursive: true });
			symlinkSync(hono, honoDest, "dir");
		}
	}
}

export function findRepoRoot(from: string): string | undefined {
	let dir = from;
	for (let i = 0; i < 12; i += 1) {
		if (
			existsSync(join(dir, "packages", "bindles", "package.json")) &&
			existsSync(join(dir, "packages", "hobo", "package.json"))
		) {
			return dir;
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return undefined;
}

function firstExisting(paths: readonly string[]): string | undefined {
	return paths.find((path) => existsSync(path));
}
