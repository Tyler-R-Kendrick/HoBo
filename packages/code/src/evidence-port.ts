import { createHash, createHmac, randomUUID } from "node:crypto";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { parseGuestEvidenceSubmission } from "./parse.js";
import type { EvidenceKind, GuestEvidenceSubmission } from "./types.js";

export interface StoredEvidenceRecord extends GuestEvidenceSubmission {
	readonly id: string;
	readonly verification: "claimed";
	readonly origin: string;
	readonly actor: string;
	readonly recordedAt: string;
	readonly signature?: string;
}

export interface EvidenceArtifactRef {
	readonly id: string;
	readonly mediaType: string;
	readonly sha256: string;
	readonly size: bigint;
}

export interface StoredEvidenceArtifact extends EvidenceArtifactRef {
	readonly title: string;
	readonly path: string;
}

export function createEvidencePort(options: {
	readonly root: string;
	readonly actor: string;
	readonly origin: string;
	readonly signingKey: string;
	readonly now?: () => string;
}) {
	const recordsPath = join(options.root, "records.jsonl");
	const assetsRoot = join(options.root, "assets", "sha256");
	mkdirSync(assetsRoot, { recursive: true });
	const artifactPath = (id: string) =>
		join(assetsRoot, id.replace(/^sha256:/u, ""));
	const metadataPath = (id: string) => `${artifactPath(id)}.json`;
	return {
		artifactPath,
		artifact(id: string): StoredEvidenceArtifact | undefined {
			if (!existsSync(metadataPath(id))) return undefined;
			const value = JSON.parse(readFileSync(metadataPath(id), "utf8")) as Omit<
				StoredEvidenceArtifact,
				"size"
			> & { size: string };
			return { ...value, size: BigInt(value.size) };
		},
		beginArtifact(metadata: {
			readonly title: string;
			readonly mediaType: string;
		}) {
			if (
				!metadata.title.trim() ||
				!/^[\w.+-]+\/[\w.+-]+$/u.test(metadata.mediaType)
			) {
				throw new TypeError("evidence artifact metadata is invalid");
			}
			const chunks: Buffer[] = [];
			let size = 0;
			let finished = false;
			return {
				write(chunk: Uint8Array) {
					if (finished) throw new Error("evidence artifact writer is finished");
					size += chunk.byteLength;
					// ponytail: in-memory cap keeps this adapter tiny; stream to a temp file above 64 MiB use cases.
					if (size > 64 * 1024 * 1024)
						throw new Error("evidence artifact exceeds 64 MiB");
					chunks.push(Buffer.from(chunk));
				},
				finish(): EvidenceArtifactRef {
					if (finished) throw new Error("evidence artifact writer is finished");
					finished = true;
					const bytes = Buffer.concat(chunks);
					const sha256 = createHash("sha256").update(bytes).digest("hex");
					const target = artifactPath(`sha256:${sha256}`);
					if (!existsSync(target)) {
						const temporary = `${target}.${randomUUID()}.tmp`;
						writeFileSync(temporary, bytes, { flag: "wx" });
						renameSync(temporary, target);
					}
					const artifact = {
						id: `sha256:${sha256}`,
						mediaType: metadata.mediaType,
						sha256,
						size: BigInt(size),
					};
					if (!existsSync(metadataPath(artifact.id))) {
						writeFileSync(
							metadataPath(artifact.id),
							JSON.stringify({
								...artifact,
								size: String(artifact.size),
								title: metadata.title,
								path: `assets/sha256/${sha256}`,
							}),
						);
					}
					return artifact;
				},
			};
		},
		submit(input: unknown): string {
			const submission = parseGuestEvidenceSubmission(input);
			for (const ref of submission.artifactRefs) {
				if (!existsSync(artifactPath(ref)))
					throw new Error(`unknown evidence artifact: ${ref}`);
			}
			const id = randomUUID();
			const record: StoredEvidenceRecord = {
				...submission,
				id,
				verification: "claimed",
				origin: options.origin,
				actor: options.actor,
				recordedAt: options.now?.() ?? new Date().toISOString(),
				...(submission.kind === "note"
					? {
							signature: `hmac-sha256:${createHmac("sha256", options.signingKey)
								.update(JSON.stringify({ id, ...submission }))
								.digest("hex")}`,
						}
					: {}),
			};
			appendFileSync(recordsPath, `${JSON.stringify(record)}\n`, {
				encoding: "utf8",
				flag: "a",
			});
			return id;
		},
		records(kind?: EvidenceKind): readonly StoredEvidenceRecord[] {
			if (!existsSync(recordsPath)) return [];
			return readFileSync(recordsPath, "utf8")
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line) as StoredEvidenceRecord)
				.filter((record) => kind === undefined || record.kind === kind);
		},
	};
}
