/**
 * The verified, content-addressed fetch behind every asset pin.
 *
 * Bytes are hashed while they stream to a private `*.partial` file and are
 * deleted on any mismatch before anything is extracted or made executable
 * (the discipline of `scripts/fetch-celld.mts`, generalised). The cache is
 * keyed by content: `<cache>/<sha256>/<entry>`, so two pins of the same bytes
 * share one directory and a cached file is trusted only after being re-hashed.
 *
 * Erasable TypeScript with node builtins only.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, mkdir, open, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

import { type AssetFile, assertAllowedUrl, PinsError } from "./pins.ts";
import { cachedPath } from "./pins-assets.ts";

export async function sha256OfFile(path: string): Promise<string> {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(path)) hash.update(chunk);
	return hash.digest("hex");
}

export interface FetchOptions {
	readonly allowLocal?: boolean;
	/** Abort once more than this many bytes arrive. */
	readonly maxBytes?: number;
	/** The finished file must be exactly this long. */
	readonly expectedSize?: number;
	readonly timeoutMs?: number;
	readonly fetch?: typeof fetch;
}

const MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 512 * 1024 ** 2;

async function getFollowing(
	url: string,
	options: FetchOptions,
	signal: AbortSignal,
): Promise<Response> {
	const allowLocal = options.allowLocal === true;
	const get = options.fetch ?? fetch;
	let current = assertAllowedUrl(url, allowLocal, "download").toString();
	for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
		let response: Response;
		try {
			response = await get(current, { redirect: "manual", signal });
		} catch (error) {
			const cause =
				error instanceof Error && error.cause instanceof Error
					? error.cause.message
					: "";
			throw new PinsError(
				"NETWORK",
				`request to ${current} failed: ${cause || (error instanceof Error ? error.message : String(error))}. ` +
					"Behind a proxy set NODE_USE_ENV_PROXY=1 and, for a TLS-intercepting one, NODE_EXTRA_CA_CERTS.",
			);
		}
		if (response.status < 300 || response.status >= 400) return response;
		const location = response.headers.get("location");
		await response.body?.cancel();
		if (location === null)
			throw new PinsError(
				"HTTP_STATUS",
				`${current} redirected without a location`,
			);
		const next = new URL(location, current).toString();
		try {
			assertAllowedUrl(next, allowLocal, "redirect");
		} catch {
			throw new PinsError(
				"REDIRECT_REFUSED",
				`${current} redirects to ${next}, which is not https`,
			);
		}
		current = next;
	}
	throw new PinsError(
		"REDIRECT_REFUSED",
		`${url} redirected more than ${MAX_REDIRECTS} times`,
	);
}

/**
 * Download `url` to `dest`, keeping it only if it hashes to `sha256`.
 *
 * The bytes go to a private `*.partial` file (0600), are hashed as they
 * arrive, and are deleted on any mismatch before anything is extracted or
 * made executable. Only a verified file is made executable and renamed to its
 * final name, so `dest` never holds unverified bytes.
 */
export async function fetchVerified(
	url: string,
	sha256: string,
	dest: string,
	options: FetchOptions = {},
): Promise<void> {
	const limit = options.maxBytes ?? DEFAULT_MAX_BYTES;
	const partial = `${dest}.${process.pid}.partial`;
	await mkdir(dirname(dest), { recursive: true });
	const response = await getFollowing(
		url,
		options,
		AbortSignal.timeout(options.timeoutMs ?? 300_000),
	);
	if (!response.ok || response.body === null) {
		await response.body?.cancel();
		throw new PinsError("HTTP_STATUS", `${url} answered ${response.status}`);
	}
	const hash = createHash("sha256");
	let seen = 0;
	const handle = await open(partial, "wx", 0o600);
	try {
		for await (const chunk of response.body) {
			seen += chunk.byteLength;
			if (seen > limit)
				throw new PinsError(
					"SIZE_EXCEEDED",
					`${url} sent more than ${limit} bytes`,
				);
			hash.update(chunk);
			await handle.write(chunk);
		}
	} catch (error) {
		await handle.close();
		await rm(partial, { force: true });
		throw error;
	}
	await handle.close();
	const actual = hash.digest("hex");
	if (actual !== sha256) {
		await rm(partial, { force: true });
		throw new PinsError(
			"DIGEST_MISMATCH",
			`${url} hashes to ${actual} but the pin says ${sha256}; refusing to use these bytes`,
		);
	}
	if (options.expectedSize !== undefined && seen !== options.expectedSize) {
		await rm(partial, { force: true });
		throw new PinsError(
			"SIZE_MISMATCH",
			`${url} is ${seen} bytes but the pin says ${options.expectedSize}`,
		);
	}
	await chmod(partial, 0o755);
	await rename(partial, dest);
}

export type CacheState =
	| { readonly state: "absent" }
	| { readonly state: "ok" }
	| { readonly state: "mismatch"; readonly actual: string };

/** Re-hash what the cache holds for `file`; never trusts a file by its name. */
export async function verifyCached(
	cache: string,
	file: AssetFile,
): Promise<CacheState> {
	const path = cachedPath(cache, file);
	let actual: string;
	try {
		actual = await sha256OfFile(path);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT")
			return { state: "absent" };
		throw error;
	}
	return actual === file.sha256
		? { state: "ok" }
		: { state: "mismatch", actual };
}

/** The cached path of `file`, downloading and verifying it first when needed. */
export async function ensureCached(
	cache: string,
	file: AssetFile,
	options: FetchOptions = {},
): Promise<{ readonly path: string; readonly downloaded: boolean }> {
	const path = cachedPath(cache, file);
	const state = await verifyCached(cache, file);
	if (state.state === "ok") return { path, downloaded: false };
	if (state.state === "mismatch") await rm(path, { force: true });
	await fetchVerified(file.url, file.sha256, path, {
		...options,
		maxBytes: file.size,
		expectedSize: file.size,
	});
	return { path, downloaded: true };
}
