/**
 * What an asset pin means on this machine: which build it is, where its bytes
 * live once verified, which variable overrides it, and how a release lists its
 * digests. Pure; the download itself is `pins-fetch.ts`.
 *
 * Erasable TypeScript with node builtins only.
 */
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

import { type AssetFile, type AssetPin, PinsError } from "./pins.ts";

/** `linux-x64`, `linux-arm64`: the key under which an asset pin lists a file. */
export function currentTarget(
	platform: string = process.platform,
	arch: string = process.arch,
): string {
	return `${platform}-${arch}`;
}

export function assetFor(
	pin: AssetPin,
	name: string,
	target: string = currentTarget(),
): AssetFile {
	const file = pin.files[target];
	if (file === undefined) {
		const supported = Object.keys(pin.files).sort().join(", ");
		throw new PinsError(
			"TARGET_UNSUPPORTED",
			`${name} is not published for ${target}; supported: ${supported}`,
		);
	}
	return file;
}

/** The variable that points a lane at a local build instead of the pinned asset. */
export function overrideEnv(name: string): string {
	switch (name) {
		case "mirror":
			return "MIRROR_BIN";
		case "opensesame-kit":
			return "HOBO_OPENSESAME_KIT";
		default:
			return `HOBO_${name.toUpperCase().replace(/-/gu, "_")}`;
	}
}

/** `${XDG_CACHE_HOME:-~/.cache}/siblings`: once per machine, outside every repository. */
export function cacheDir(env: NodeJS.ProcessEnv = process.env): string {
	const xdg = env.XDG_CACHE_HOME;
	const base =
		xdg !== undefined && isAbsolute(xdg)
			? xdg
			: join(env.HOME ?? homedir(), ".cache");
	return join(base, "siblings");
}

/** `<cache>/<sha256>/<entry>`: the key is the content, so two pins of the same bytes share it. */
export function cachedPath(cache: string, file: AssetFile): string {
	return join(cache, file.sha256, file.entry);
}

/** Where a release publishes its assets and `SHA256SUMS`. */
export function releaseBase(repo: string, tag: string): string {
	return `${repo.replace(/\/+$/u, "").replace(/\.git$/u, "")}/releases/download/${tag}/`;
}

const SUMS_LINE = /^([0-9a-f]{64}) [ *]([^\s/\\][^/\\]*)$/u;

/** `sha256sum` output: name -> digest. Anything else in the file is an error. */
export function parseSums(text: string): ReadonlyMap<string, string> {
	const sums = new Map<string, string>();
	for (const line of text.split(/\r?\n/u)) {
		if (line.trim() === "" || line.startsWith("#")) continue;
		const match = SUMS_LINE.exec(line);
		const digest = match?.[1];
		const name = match?.[2];
		if (digest === undefined || name === undefined || sums.has(name)) {
			throw new PinsError(
				"SUMS_MALFORMED",
				`cannot read this SHA256SUMS line: ${line.slice(0, 80)}`,
			);
		}
		sums.set(name, digest);
	}
	return sums;
}
