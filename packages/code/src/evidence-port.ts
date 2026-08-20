import {
	createHash,
	createHmac,
	randomUUID,
	timingSafeEqual,
} from "node:crypto";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { JsonValue } from "./json.js";

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

export interface ReadEvidenceArtifact extends StoredEvidenceArtifact {
	readonly bytes: Uint8Array;
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
	const artifactPath = (id: string) => join(assetsRoot, artifactDigest(id));
	const metadataPath = (id: string) => `${artifactPath(id)}.json`;
	const artifact = (id: string): StoredEvidenceArtifact | undefined => {
		const digest = artifactDigest(id);
		if (!existsSync(metadataPath(id))) return undefined;
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const value = JSON.parse(readFileSync(metadataPath(id), "utf8")) as Omit<
			StoredEvidenceArtifact,
			"size"
		> & { size: string };
		if (
			value.id !== id ||
			value.sha256 !== digest ||
			value.path !== `assets/sha256/${digest}` ||
			!value.title?.trim() ||
			!/^[-A-Za-z0-9_.+]+\/[-A-Za-z0-9_.+]+$/u.test(value.mediaType) ||
			!/^\d+$/u.test(value.size)
		) {
			throw new Error(`evidence artifact metadata mismatch: ${id}`);
		}
		return { ...value, size: BigInt(value.size) };
	};
	const readArtifact = (id: string): ReadEvidenceArtifact => {
		const metadata = artifact(id);
		if (!metadata) throw new Error(`unknown evidence artifact: ${id}`);
		const bytes = readFileSync(artifactPath(id));
		if (
			createHash("sha256").update(bytes).digest("hex") !== metadata.sha256 ||
			BigInt(bytes.byteLength) !== metadata.size
		) {
			throw new Error(`evidence artifact digest mismatch: ${id}`);
		}
		return { ...metadata, bytes };
	};
	const signatureFor = (record: Omit<StoredEvidenceRecord, "signature">) =>
		createHmac("sha256", options.signingKey)
			.update(JSON.stringify(record))
			.digest();
	return {
		artifactPath,
		artifact,
		readArtifact,
		exportArtifacts(ids: readonly string[]): readonly ReadEvidenceArtifact[] {
			return ids.map(readArtifact);
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
		submit(input: JsonValue | undefined): string {
			const submission = parseGuestEvidenceSubmission(input);
			for (const ref of submission.artifactRefs) readArtifact(ref);
			const id = randomUUID();
			const unsignedRecord: Omit<StoredEvidenceRecord, "signature"> = {
				...submission,
				id,
				verification: "claimed",
				origin: options.origin,
				actor: options.actor,
				recordedAt: options.now?.() ?? new Date().toISOString(),
			};
			const record: StoredEvidenceRecord = {
				...unsignedRecord,
				...(submission.kind === "note"
					? {
							signature: `hmac-sha256:${signatureFor(unsignedRecord).toString("hex")}`,
						}
					: undefined),
			};
			appendFileSync(recordsPath, `${JSON.stringify(record)}\n`, {
				encoding: "utf8",
				flag: "a",
			});
			return id;
		},
		records(kind?: EvidenceKind): readonly StoredEvidenceRecord[] {
			if (!existsSync(recordsPath)) return [];
			return (
				readFileSync(recordsPath, "utf8")
					.split("\n")
					.filter(Boolean)
					// SAFETY: parsed or fixture value is the named domain type after this assertion.
					.map((line) => {
						// SAFETY: each records file line is a StoredEvidenceRecord JSON object.
						return JSON.parse(line) as StoredEvidenceRecord;
					})
					.map((record) => {
						if (record.kind !== "note") return record;
						const signature = record.signature?.match(
							/^hmac-sha256:([a-f0-9]{64})$/u,
						)?.[1];
						const { signature: _signature, ...unsignedRecord } = record;
						if (
							!signature ||
							!timingSafeEqual(
								Buffer.from(signature, "hex"),
								signatureFor(unsignedRecord),
							)
						) {
							throw new Error(`evidence note signature mismatch: ${record.id}`);
						}
						return record;
					})
					.filter((record) => kind === undefined || record.kind === kind)
			);
		},
	};
}

function artifactDigest(id: string): string {
	const digest = id.match(/^sha256:([a-f0-9]{64})$/u)?.[1];
	if (!digest) throw new TypeError(`invalid evidence artifact id: ${id}`);
	return digest;
}

/** Structural host binding for hobo:evidence/evidence@0.1.0. */
export function asHoboEvidenceHost(
	port: ReturnType<typeof createEvidencePort>,
): Pick<ReturnType<typeof createEvidencePort>, "submit" | "beginArtifact"> {
	return { submit: port.submit, beginArtifact: port.beginArtifact };
}
