/**
 * What `bootstrap-siblings` does with an asset pin: report it, fetch it, move
 * it to another release.
 *
 * An asset is one file per target, pinned by sha256 and kept in the
 * content-addressed cache. A release lists its digests in `SHA256SUMS`; the
 * convention that makes a bump mechanical is `<pin name>-<target>` for each
 * file (`mirror-linux-x64`). A bump downloads every file it pins and checks
 * it against the published sum, so a pin is never written from a list alone.
 *
 * Erasable TypeScript with node builtins only.
 */
import { statSync } from "node:fs";
import { basename, join } from "node:path";

import {
	type AssetFile,
	type AssetPin,
	checkRepoUrl,
	isReleaseTag,
	type Pins,
	PinsError,
	parsePins,
} from "./pins.ts";
import {
	assetFor,
	overrideEnv,
	parseSums,
	releaseBase,
	serializePins,
} from "./pins-assets.ts";
import { cacheProblem, prepareCache } from "./pins-cache.ts";
import {
	ensureCached,
	type FetchOptions,
	fetchText,
	fetchVerified,
	verifyCached,
} from "./pins-fetch.ts";
import { sameRepo } from "./pins-repo-url.ts";

export interface AssetContext {
	readonly cache: string;
	readonly target: string;
	readonly env: NodeJS.ProcessEnv;
	readonly online: boolean;
	readonly fetchOptions: FetchOptions;
}

export interface AssetReport {
	readonly summary: string;
	readonly problems: readonly string[];
	readonly fixes: readonly string[];
}

const SUMS = "SHA256SUMS";
/** The targets a release is expected to publish when its pin has none yet. */
const DEFAULT_TARGETS = ["linux-x64", "linux-arm64"] as const;

function short(digest: string): string {
	return digest.slice(0, 7);
}

function fetchHint(name: string): string {
	return `pnpm run pins:fetch ${name}`;
}

/** Whether this run is a CI run: `CI` set to anything but empty, false or 0. */
function inCi(env: NodeJS.ProcessEnv): boolean {
	const ci = (env.CI ?? "").toLowerCase();
	return ci !== "" && ci !== "false" && ci !== "0";
}

/**
 * An override variable points a lane at a local binary, which nothing has
 * verified. Refuse it in CI, where a green run has to mean the pinned bytes
 * ran, unless `HOBO_PINS_ALLOW_OVERRIDE=1` says the run means something else.
 */
export function refuseOverridesInCi(
	names: readonly string[],
	env: NodeJS.ProcessEnv,
): void {
	if (!inCi(env) || env.HOBO_PINS_ALLOW_OVERRIDE === "1") return;
	const set = names.map(overrideEnv).filter((variable) => env[variable]);
	if (set.length > 0) {
		throw new PinsError(
			"OVERRIDE_IN_CI",
			`${set.join(", ")} ${set.length > 1 ? "are" : "is"} set in CI: a binary named by an override is unverified, so a green run would not mean the pinned release ran. Unset ${set.length > 1 ? "them" : "it"}, or set HOBO_PINS_ALLOW_OVERRIDE=1 if this run is meant to test a local build`,
		);
	}
}

/** Offline: the cached bytes still hash to the pin. Online: the release still says so. */
export async function statusAsset(
	name: string,
	pin: AssetPin | null,
	ctx: AssetContext,
): Promise<AssetReport> {
	if (pin === null) {
		const variable = overrideEnv(name);
		const state = ctx.env[variable] ? "is set" : "is unset";
		return {
			summary: `${name}  unpinned  (not published yet; ${variable} ${state})`,
			problems: [],
			fixes: [],
		};
	}
	const published = Object.keys(pin.files).sort().join(", ");
	if (pin.files[ctx.target] === undefined) {
		return {
			summary: `${name}  ${pin.tag}  n/a  (no ${ctx.target} build; published: ${published})`,
			problems: [],
			fixes: [],
		};
	}
	const file = assetFor(pin, name, ctx.target);
	const problems: string[] = [];
	const fixes: string[] = [];
	const unsafe = await cacheProblem(ctx.cache, file.sha256);
	if (unsafe !== null) {
		problems.push(unsafe.problem);
		fixes.push(unsafe.fix);
	}
	const cached = await verifyCached(ctx.cache, file);
	if (cached.state === "mismatch") {
		const path = join(ctx.cache, file.sha256, file.entry);
		problems.push(
			`${path} hashes to ${cached.actual}, the pin says ${file.sha256}`,
		);
		fixes.push(`${fetchHint(name)}   (replaces the corrupt file)`);
	}
	if (cached.state === "invalid") {
		const path = join(ctx.cache, file.sha256, file.entry);
		problems.push(`${path} is not a regular file (${cached.reason})`);
		fixes.push(`${fetchHint(name)}   (replaces it)`);
	}
	if (ctx.online) {
		const published = await compareWithRelease(pin, ctx);
		problems.push(...published);
		if (published.length > 0) {
			fixes.push(
				`pnpm run pins:bump ${name} ${pin.tag}   (re-pin to what the release publishes now, once you know why it changed)`,
			);
		}
	}
	const variable = overrideEnv(name);
	const shadowed = ctx.env[variable]
		? `; ${variable} is set and shadows this pin: that binary is not verified`
		: "";
	const where =
		cached.state === "ok"
			? "cached"
			: cached.state === "absent"
				? `not cached; ${fetchHint(name)}`
				: cached.state === "invalid"
					? "cache invalid"
					: "cache corrupt";
	const mark = problems.length === 0 ? "ok" : "FAIL";
	const online =
		ctx.online && problems.length === 0 ? "; matches SHA256SUMS" : "";
	return {
		summary: `${name}  ${pin.tag}  ${mark}  (${ctx.target} sha256 ${short(file.sha256)}, ${where}${online}${shadowed})`,
		problems,
		fixes,
	};
}

async function compareWithRelease(
	pin: AssetPin,
	ctx: AssetContext,
): Promise<string[]> {
	const url = `${releaseBase(pin.repo, pin.tag)}${SUMS}`;
	const sums = parseSums(await fetchText(url, ctx.fetchOptions));
	const problems: string[] = [];
	for (const [target, file] of Object.entries(pin.files)) {
		const published = sums.get(basename(new URL(file.url).pathname));
		if (published !== file.sha256) {
			problems.push(
				`${target}: the pin says ${file.sha256}; ${SUMS} of ${pin.tag} says ${published ?? "nothing"}`,
			);
		}
	}
	return problems;
}

/** Download, verify and cache this machine's build; the line to print. */
export async function fetchAsset(
	name: string,
	pin: AssetPin | null,
	ctx: AssetContext,
	explicit: boolean,
): Promise<string> {
	const variable = overrideEnv(name);
	if (pin === null) {
		if (explicit) {
			throw new PinsError(
				"ASSET_UNPUBLISHED",
				`${name} has no published release pinned yet; set ${variable} to a local build`,
			);
		}
		return `${name}  skipped  (not published yet; set ${variable} to a local build)`;
	}
	const file = assetFor(pin, name, ctx.target);
	const { path, downloaded } = await ensureCached(
		ctx.cache,
		file,
		ctx.fetchOptions,
	);
	return downloaded
		? `${name}  fetched ${ctx.target} (${file.size} bytes, sha256 ${short(file.sha256)}) to ${path}`
		: `${name}  already cached at ${path}`;
}

function oldEntries(pin: AssetPin | null): string[] {
	return pin === null
		? []
		: [...new Set(Object.values(pin.files).map((file) => file.entry))];
}

export interface BumpOptions {
	/** `--repo`: the repository that publishes the release. */
	readonly repo: string | undefined;
	/** `--drop`: targets the new release is allowed to stop publishing. */
	readonly drop: readonly string[];
	/** `--entry`: rename the file the verified bytes are kept and run under. */
	readonly entry: string | undefined;
	readonly allowLocal: boolean;
}

export interface Bumped {
	readonly text: string;
	/** What to print: the move, then what was kept and what was dropped. */
	readonly lines: readonly string[];
}

interface TargetPlan {
	readonly keep: string[];
	readonly dropped: readonly string[];
	readonly unpublished: string[];
}

/**
 * Refuse a bump that would lose a build without being told to: every target
 * the pin has must be published by the release, or named in `--drop`.
 */
function planTargets(
	name: string,
	tag: string,
	pin: AssetPin | null,
	sums: ReadonlyMap<string, string>,
	drop: readonly string[],
): TargetPlan {
	const listed = (target: string): boolean => sums.has(`${name}-${target}`);
	const had = pin === null ? [] : Object.keys(pin.files);
	for (const target of drop) {
		if (!had.includes(target)) {
			throw new PinsError(
				"USAGE",
				`--drop ${target}: the pin has no such target (it has ${had.join(", ") || "none"})`,
			);
		}
		if (listed(target)) {
			throw new PinsError(
				"USAGE",
				`--drop ${target}: the release publishes it`,
			);
		}
	}
	const undeclared = had.filter(
		(target) => !listed(target) && !drop.includes(target),
	);
	if (undeclared.length > 0) {
		throw new PinsError(
			"TARGET_DROPPED",
			`${SUMS} of ${tag} does not list ${undeclared.map((target) => `${name}-${target}`).join(", ")}; the pin would lose ${undeclared.join(", ")}. Re-run with ${undeclared.map((target) => `--drop ${target}`).join(" ")} if that is meant`,
		);
	}
	const wanted = pin === null ? [...DEFAULT_TARGETS] : had;
	return {
		keep: wanted.filter(listed),
		dropped: drop,
		unpublished: pin === null ? wanted.filter((target) => !listed(target)) : [],
	};
}

/**
 * Point `name` at release `tag`: read its SHA256SUMS, download each file it
 * pins into the cache, check it against the published sum, measure it, and
 * return the manifest text with only that entry replaced.
 */
export async function bumpAsset(
	pins: Pins,
	name: string,
	tag: string,
	options: BumpOptions,
	ctx: AssetContext,
): Promise<Bumped> {
	// Nothing the operator typed reaches a URL, the cache or the network unchecked.
	if (!isReleaseTag(tag)) {
		throw new PinsError("USAGE", `${tag} is not a release tag`);
	}
	if (options.repo !== undefined) {
		checkRepoUrl(options.repo, "--repo", options.allowLocal);
	}
	const pin = pins.assets[name] ?? null;
	// `--repo` naming the pin's own repository (a trailing slash, `.git`) is
	// not a move: keep the manifest's text and announce nothing.
	const repo =
		options.repo !== undefined &&
		pin !== null &&
		sameRepo(options.repo, pin.repo)
			? pin.repo
			: (options.repo ?? pin?.repo);
	if (repo === undefined) {
		throw new PinsError(
			"USAGE",
			`${name} has no repository yet: pass --repo <url of the repository that publishes the release>`,
		);
	}
	const base = releaseBase(repo, tag);
	const sums = parseSums(await fetchText(`${base}${SUMS}`, ctx.fetchOptions));
	const plan = planTargets(name, tag, pin, sums, options.drop);
	if (plan.keep.length === 0) {
		throw new PinsError(
			"SUMS_MALFORMED",
			`${SUMS} of ${tag} lists none of ${DEFAULT_TARGETS.map((target) => `${name}-${target}`).join(", ")}`,
		);
	}
	await prepareCache(ctx.cache);
	const files: Record<string, AssetFile> = {};
	for (const target of plan.keep) {
		const published = `${name}-${target}`;
		const sha256 = sums.get(published) ?? "";
		// The name a binary runs under is the pin's, not the release's: carry it over.
		const entry = options.entry ?? pin?.files[target]?.entry ?? name;
		await prepareCache(ctx.cache, sha256);
		const dest = join(ctx.cache, sha256, entry);
		await fetchVerified(`${base}${published}`, sha256, dest, ctx.fetchOptions);
		files[target] = {
			url: `${base}${published}`,
			sha256,
			size: statSync(dest).size,
			entry,
		};
	}
	const next: Pins = {
		...pins,
		assets: { ...pins.assets, [name]: { repo, tag, files } },
	};
	const text = serializePins(next);
	parsePins(text, { allowLocal: options.allowLocal });
	const move = `${name}  ${pin?.tag ?? "unpinned"} -> ${tag}  (each file downloaded and checked against ${SUMS})`;
	const lost =
		plan.unpublished.length > 0
			? `not published: ${plan.unpublished.join(", ")}`
			: `dropped: ${plan.dropped.length > 0 ? plan.dropped.join(", ") : "none"}`;
	const renamed = [
		...new Set(Object.values(files).map((file) => file.entry)),
	].filter(
		(now) => options.entry !== undefined && !oldEntries(pin).includes(now),
	);
	const lines = [move, `  kept: ${plan.keep.join(", ")}  ${lost}`];
	if (pin?.repo !== repo) {
		lines.push(`  repo: ${pin?.repo ?? "(none)"} -> ${repo}`);
	}
	if (renamed.length > 0) {
		lines.push(
			`  entry: ${oldEntries(pin).join(", ") || "(none)"} -> ${renamed.join(", ")}`,
		);
	}
	return { text, lines };
}
