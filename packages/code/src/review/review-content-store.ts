import { createHash, randomUUID } from "node:crypto";
import {
	chmodSync,
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { reviewError } from "./review-errors.js";
import type { ReviewContentStore } from "./review-ports.js";

export const REVIEW_CONTENT_HASH = /^[a-f0-9]{64}$/u;
export const DEFAULT_REVIEW_CONTENT_MAX_BYTES = 8 * 1024 * 1024;

export function sha256Hex(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export function createReviewContentStore(options: {
	readonly root: string;
	readonly maxBytes?: number;
}): ReviewContentStore {
	const maxBytes = options.maxBytes ?? DEFAULT_REVIEW_CONTENT_MAX_BYTES;
	mkdirSync(options.root, { recursive: true, mode: 0o700 });
	chmodSync(options.root, 0o700);

	const pathFor = (hash: string): string => {
		if (!REVIEW_CONTENT_HASH.test(hash)) {
			throw reviewError("malformed-input", "content hash must be sha256 hex", {
				hash,
			});
		}
		return join(options.root, hash);
	};

	return {
		async put(bytes) {
			if (bytes.byteLength > maxBytes) {
				throw reviewError("body-limit", "content exceeds store limit", {
					size: bytes.byteLength,
					maxBytes,
				});
			}
			const hash = sha256Hex(bytes);
			const target = pathFor(hash);
			if (existsSync(target)) return hash;
			const temporary = join(
				options.root,
				`.tmp-${process.pid}-${randomUUID()}`,
			);
			const descriptor = openSync(temporary, "wx", 0o600);
			try {
				writeFileSync(descriptor, bytes);
				fsyncSync(descriptor);
			} finally {
				closeSync(descriptor);
			}
			renameSync(temporary, target);
			chmodSync(target, 0o600);
			const directory = openSync(options.root, "r");
			try {
				fsyncSync(directory);
			} finally {
				closeSync(directory);
			}
			return hash;
		},
		async get(hash) {
			const target = pathFor(hash);
			if (!existsSync(target)) {
				throw reviewError("not-found", "content blob is missing", { hash });
			}
			const size = statSync(target).size;
			if (size > maxBytes) {
				throw reviewError("body-limit", "content exceeds store limit", {
					size,
					maxBytes,
				});
			}
			const bytes = new Uint8Array(readFileSync(target));
			if (sha256Hex(bytes) !== hash) {
				throw reviewError("corrupted-state", "content blob failed hash check", {
					hash,
				});
			}
			return bytes;
		},
		async has(hash) {
			return existsSync(pathFor(hash));
		},
	};
}
