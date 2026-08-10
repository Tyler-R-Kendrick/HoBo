/**
 * Per-host one-shot cooldown (avoid DDoS / quota thrash on free anon lanes).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { AnonContainerHostId } from "./types.mts";

export const ANON_HOST_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export type HostCooldown = {
	readonly until: number;
	readonly reason: string;
	readonly at: string;
};

export function anonHostCooldownDir(): string {
	return (
		process.env.HOBO_ANON_HOST_COOLDOWN_DIR?.trim() ||
		path.join(tmpdir(), "hobo-anon-host-cooldown")
	);
}

export function hostCooldownPath(host: AnonContainerHostId): string {
	return path.join(anonHostCooldownDir(), `${host}.json`);
}

export function isRateLimitMessage(message: string): boolean {
	return /429|rate.?limit|too many requests|quota|exhausted/iu.test(message);
}

export async function readHostCooldown(
	host: AnonContainerHostId,
): Promise<HostCooldown | null> {
	try {
		const raw = await readFile(hostCooldownPath(host), "utf8");
		const parsed = JSON.parse(raw) as Partial<HostCooldown>;
		if (typeof parsed.until !== "number" || parsed.until <= Date.now()) {
			return null;
		}
		return {
			until: parsed.until,
			reason: typeof parsed.reason === "string" ? parsed.reason : "cooldown",
			at: typeof parsed.at === "string" ? parsed.at : new Date().toISOString(),
		};
	} catch {
		return null;
	}
}

export async function writeHostCooldown(
	host: AnonContainerHostId,
	reason: string,
	ms = ANON_HOST_COOLDOWN_MS,
): Promise<HostCooldown> {
	const payload: HostCooldown = {
		until: Date.now() + ms,
		reason: reason.slice(0, 400),
		at: new Date().toISOString(),
	};
	const filePath = hostCooldownPath(host);
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
	return payload;
}
