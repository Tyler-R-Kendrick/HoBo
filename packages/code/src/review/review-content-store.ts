import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { isJsonString } from "../json.js";

import { REVIEW_ERROR, ReviewError } from "./review-errors.js";

const MAX_BLOB = 8 * 1024 * 1024;

export function sha256Hex(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export function createReviewContentStore(root: string) {
	const dir = join(root, "review-blobs");
	mkdirSync(dir, { recursive: true, mode: 0o700 });

	function pathFor(digest: string): string {
		if (!/^[a-f0-9]{64}$/u.test(digest)) {
			throw new ReviewError(
				REVIEW_ERROR.MALFORMED,
				"content digest is not sha256",
			);
		}
		return join(dir, digest.slice(0, 2), digest.slice(2));
	}

	return {
		put(bytes: Uint8Array | string): string {
			const buffer = isJsonString(bytes)
				? Buffer.from(bytes)
				: Buffer.from(bytes);
			if (buffer.byteLength > MAX_BLOB) {
				throw new ReviewError(REVIEW_ERROR.LIMIT, "review blob exceeds 8MiB");
			}
			const digest = sha256Hex(buffer);
			const dest = pathFor(digest);
			if (existsSync(dest)) return digest;
			mkdirSync(dirname(dest), { recursive: true, mode: 0o700 });
			const tmp = `${dest}.tmp-${process.pid}`;
			writeFileSync(tmp, buffer, { mode: 0o600 });
			const verify = sha256Hex(readFileSync(tmp));
			if (verify !== digest) {
				unlinkSync(tmp);
				throw new ReviewError(
					REVIEW_ERROR.CORRUPT,
					"content store write hash mismatch",
				);
			}
			renameSync(tmp, dest);
			return digest;
		},
		get(digest: string): Uint8Array {
			const dest = pathFor(digest);
			if (!existsSync(dest)) {
				throw new ReviewError(REVIEW_ERROR.NOT_FOUND, `blob ${digest} missing`);
			}
			const bytes = readFileSync(dest);
			if (sha256Hex(bytes) !== digest) {
				throw new ReviewError(
					REVIEW_ERROR.CORRUPT,
					`blob ${digest} failed hash check`,
				);
			}
			return bytes;
		},
		getText(digest: string): string {
			return Buffer.from(this.get(digest)).toString("utf8");
		},
	};
}

export type ReviewContentStore = ReturnType<typeof createReviewContentStore>;
