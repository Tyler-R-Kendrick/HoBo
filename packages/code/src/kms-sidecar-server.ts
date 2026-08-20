/**
 * Station-local KMS sidecar for residual secret + crypto Bindle kinds.
 * Real node:crypto (RSA-2048 + AES-256-GCM), optionally persisted under
 * the Station home. Not a fixture and not a cloud mock.
 */

import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createPrivateKey,
	createPublicKey,
	createSign,
	createVerify,
	generateKeyPairSync,
	type KeyObject,
	randomBytes,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import {
	isJsonObject,
	isJsonString,
	type JsonObject,
	type JsonValue,
	parseJsonValue,
} from "./json.js";

import { occupancyNamedOrigin } from "./occupancy-endpoints.js";

// public-contract: occupancy name of the station KMS sidecar
export const KMS_SIDECAR_NAME = "kms" as const;
// public-contract: KMS sidecar is occupancy-hosted, not a Bindle kind
export const KMS_SIDECAR_HOSTING = "station" as const;
// public-contract: residual crypto Bindle port hosted by Station KMS
export const KMS_CRYPTO_PORT = "hobo:crypto" as const;
// public-contract: residual secrets Bindle port hosted by Station KMS
export const KMS_SECRETS_PORT = "hobo:secrets" as const;
// public-contract: default Station wrapping key id
export const STATION_KMS_KEY = "station" as const;
// public-contract: on-disk Station KMS store schema
export const STATION_KMS_STORE_SCHEMA = "hobo.station-kms/v1" as const;

export interface StationKmsBox {
	readonly ciphertext: string;
	readonly iv: string;
	readonly authTag: string;
}

export interface StationSecretAccess {
	readonly valueRef: string;
	readonly versionId: string;
	readonly material: string;
}

interface StoredKey {
	privateKey: KeyObject;
	publicKey: KeyObject;
	aesKey: Buffer;
}

interface SecretVersion {
	readonly id: string;
	readonly box: StationKmsBox;
}

export class StationKms {
	private readonly keys = new Map<string, StoredKey>();
	private readonly secrets = new Map<string, SecretVersion[]>();
	private readonly persistPath: string | undefined;

	constructor(options: { readonly persistDir?: string } = {}) {
		this.persistPath =
			options.persistDir !== undefined
				? join(options.persistDir, "store.json")
				: undefined;
		if (this.persistPath !== undefined && existsSync(this.persistPath)) {
			this.load(this.persistPath);
		}
		if (!this.keys.has(STATION_KMS_KEY)) {
			this.generate(STATION_KMS_KEY);
		}
	}

	listKeys(): readonly string[] {
		return Object.freeze([...this.keys.keys()]);
	}

	generate(kid: string): void {
		if (this.keys.has(kid)) {
			throw Object.assign(new Error(`KMS key already exists: ${kid}`), {
				code: "kms-key-exists",
			});
		}
		const { privateKey, publicKey } = generateKeyPairSync("rsa", {
			modulusLength: 2048,
		});
		this.keys.set(kid, {
			privateKey,
			publicKey,
			aesKey: randomBytes(32),
		});
		this.save();
	}

	require(kid: string): StoredKey {
		const key = this.keys.get(kid);
		if (!key) {
			throw Object.assign(new Error(`unknown KMS key: ${kid}`), {
				code: "kms-key-missing",
			});
		}
		return key;
	}

	sign(kid: string, payload: string): string {
		return createSign("RSA-SHA256")
			.update(payload)
			.end()
			.sign(this.require(kid).privateKey)
			.toString("base64");
	}

	verify(kid: string, payload: string, signature: string): boolean {
		return createVerify("RSA-SHA256")
			.update(payload)
			.end()
			.verify(this.require(kid).publicKey, Buffer.from(signature, "base64"));
	}

	encrypt(kid: string, plaintext: string): StationKmsBox {
		const iv = randomBytes(12);
		const cipher = createCipheriv("aes-256-gcm", this.require(kid).aesKey, iv);
		const encrypted = Buffer.concat([
			cipher.update(plaintext, "utf8"),
			cipher.final(),
		]);
		return {
			ciphertext: encrypted.toString("base64"),
			iv: iv.toString("base64"),
			authTag: cipher.getAuthTag().toString("base64"),
		};
	}

	decrypt(kid: string, box: StationKmsBox): string {
		const decipher = createDecipheriv(
			"aes-256-gcm",
			this.require(kid).aesKey,
			Buffer.from(box.iv, "base64"),
		);
		decipher.setAuthTag(Buffer.from(box.authTag, "base64"));
		return Buffer.concat([
			decipher.update(Buffer.from(box.ciphertext, "base64")),
			decipher.final(),
		]).toString("utf8");
	}

	publicJwk(kid: string): JsonObject {
		return {
			...this.require(kid).publicKey.export({ format: "jwk" }),
			kid,
			alg: "RS256",
			use: "sig",
		};
	}

	listSecrets(): readonly string[] {
		return Object.freeze([...this.secrets.keys()]);
	}

	listVersions(name: string): readonly string[] {
		return Object.freeze((this.secrets.get(name) ?? []).map((row) => row.id));
	}

	putSecret(name: string, value: string) {
		if (name.length === 0) {
			throw Object.assign(new TypeError("secret name required"), {
				code: "kms-secret-invalid",
			});
		}
		if (value.length === 0) {
			throw Object.assign(new TypeError("secret value required"), {
				code: "kms-secret-invalid",
			});
		}
		const versions = [...(this.secrets.get(name) ?? [])];
		const versionId = `v${versions.length + 1}-${createHash("sha256").update(value).digest("hex").slice(0, 8)}`;
		versions.push({
			id: versionId,
			box: this.encrypt(STATION_KMS_KEY, value),
		});
		this.secrets.set(name, versions);
		this.save();
		return { versionId, valueRef: `secref://${name}/${versionId}` };
	}

	accessSecret(name: string, versionId?: string): StationSecretAccess {
		const versions = this.secrets.get(name);
		if (!versions || versions.length === 0) {
			throw Object.assign(new Error(`secret not found: ${name}`), {
				code: "kms-secret-missing",
			});
		}
		const row =
			versionId === undefined
				? versions[versions.length - 1]
				: versions.find((item) => item.id === versionId);
		if (!row) {
			throw Object.assign(new Error(`secret version not found: ${name}`), {
				code: "kms-secret-version-missing",
			});
		}
		return {
			valueRef: `secref://${name}/${row.id}`,
			versionId: row.id,
			material: this.decrypt(STATION_KMS_KEY, row.box),
		};
	}

	private save(): void {
		if (this.persistPath === undefined) return;
		mkdirSync(dirname(this.persistPath), { recursive: true });
		const keys: Record<
			string,
			{
				readonly privateKey: string;
				readonly publicKey: string;
				readonly aesKey: string;
			}
		> = {};
		for (const [kid, key] of this.keys) {
			keys[kid] = {
				privateKey: key.privateKey
					.export({ type: "pkcs8", format: "pem" })
					.toString(),
				publicKey: key.publicKey
					.export({ type: "spki", format: "pem" })
					.toString(),
				aesKey: key.aesKey.toString("base64"),
			};
		}
		const secrets: Record<string, SecretVersion[]> = {};
		for (const [name, versions] of this.secrets) {
			secrets[name] = versions;
		}
		writeFileSync(
			this.persistPath,
			`${JSON.stringify(
				{
					schema: STATION_KMS_STORE_SCHEMA,
					keys,
					secrets,
				},
				null,
				2,
			)}\n`,
			{ mode: 0o600 },
		);
	}

	private load(path: string): void {
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const parsed = JSON.parse(readFileSync(path, "utf8")) as {
			schema?: string;
			keys?: Record<
				string,
				{ privateKey?: string; publicKey?: string; aesKey?: string }
			>;
			secrets?: Record<string, SecretVersion[]>;
		};
		if (parsed.schema !== STATION_KMS_STORE_SCHEMA) return;
		for (const [kid, row] of Object.entries(parsed.keys ?? {})) {
			if (!row.privateKey || !row.publicKey || !row.aesKey) continue;
			this.keys.set(kid, {
				privateKey: createPrivateKey(row.privateKey),
				publicKey: createPublicKey(row.publicKey),
				aesKey: Buffer.from(row.aesKey, "base64"),
			});
		}
		for (const [name, versions] of Object.entries(parsed.secrets ?? {})) {
			if (!Array.isArray(versions)) continue;
			this.secrets.set(name, versions);
		}
	}
}

export interface KmsSidecarServer {
	readonly url: string;
	readonly secretUrl: string;
	readonly cryptoUrl: string;
	readonly port: number;
	readonly kms: StationKms;
	readonly close: () => Promise<void>;
}

export interface StartKmsSidecarOptions {
	readonly port?: number;
	readonly persistDir?: string;
}

export async function startKmsSidecar(
	options: StartKmsSidecarOptions = {},
): Promise<KmsSidecarServer> {
	const kms = new StationKms({
		...(options.persistDir !== undefined
			? { persistDir: options.persistDir }
			: undefined),
	});
	const server = createServer((request, response) => {
		void handle(request, response, kms);
	});
	const port = await listen(server, options.port ?? 0);
	return {
		url: occupancyNamedOrigin("kms", port),
		secretUrl: occupancyNamedOrigin("secret", port),
		cryptoUrl: occupancyNamedOrigin("crypto", port),
		port,
		kms,
		close: () => closeServer(server),
	};
}

async function handle(
	request: IncomingMessage,
	response: import("node:http").ServerResponse,
	kms: StationKms,
): Promise<void> {
	const url = new URL(request.url ?? "/", "http://127.0.0.1");
	const method = (request.method ?? "GET").toUpperCase();
	const path = url.pathname.replace(/\/+$/u, "") || "/";
	try {
		if (method === "GET" && (path === "/" || path === "/health")) {
			writeJson(response, 200, {
				name: KMS_SIDECAR_NAME,
				hosting: KMS_SIDECAR_HOSTING,
				ports: [KMS_CRYPTO_PORT, KMS_SECRETS_PORT],
				engine: "StationKms",
				live: true,
				keys: kms.listKeys(),
				secrets: kms.listSecrets(),
			});
			return;
		}
		if (method === "GET" && path === "/keys") {
			writeJson(response, 200, { keys: kms.listKeys() });
			return;
		}
		if (method === "POST" && path === "/keys") {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const body = (await readJson(request)) as { kid?: JsonValue };
			const kid =
				isJsonString(body.kid) && body.kid.length > 0
					? body.kid
					: `key_${randomBytes(4).toString("hex")}`;
			kms.generate(kid);
			writeJson(response, 201, { kid, jwk: kms.publicJwk(kid) });
			return;
		}
		const keyMatch = /^\/keys\/([^/]+)(?:\/([^/]+))?$/u.exec(path);
		if (keyMatch) {
			const kid = decodeURIComponent(keyMatch[1] ?? "");
			const action = keyMatch[2];
			if (method === "GET" && action === undefined) {
				writeJson(response, 200, { kid, jwk: kms.publicJwk(kid) });
				return;
			}
			if (method === "POST" && action === "sign") {
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				const body = (await readJson(request)) as { payload?: JsonValue };
				if (!isJsonString(body.payload)) {
					throw Object.assign(new TypeError("payload required"), {
						code: "kms-payload-invalid",
					});
				}
				writeJson(response, 200, { signature: kms.sign(kid, body.payload) });
				return;
			}
			if (method === "POST" && action === "verify") {
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				const body = (await readJson(request)) as {
					payload?: JsonValue;
					signature?: JsonValue;
				};
				if (!isJsonString(body.payload) || !isJsonString(body.signature)) {
					throw Object.assign(new TypeError("payload and signature required"), {
						code: "kms-payload-invalid",
					});
				}
				writeJson(response, 200, {
					ok: kms.verify(kid, body.payload, body.signature),
				});
				return;
			}
			if (method === "POST" && action === "encrypt") {
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				const body = (await readJson(request)) as { plaintext?: JsonValue };
				if (!isJsonString(body.plaintext)) {
					throw Object.assign(new TypeError("plaintext required"), {
						code: "kms-payload-invalid",
					});
				}
				writeJson(response, 200, kms.encrypt(kid, body.plaintext));
				return;
			}
			if (method === "POST" && action === "decrypt") {
				writeJson(response, 200, {
					plaintext: kms.decrypt(kid, asBox(await readJson(request))),
				});
				return;
			}
		}
		if (method === "GET" && path === "/secrets") {
			writeJson(response, 200, { secrets: kms.listSecrets() });
			return;
		}
		if (method === "POST" && path === "/secrets") {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const body = (await readJson(request)) as {
				name?: JsonValue;
				value?: JsonValue;
			};
			if (!isJsonString(body.name) || !isJsonString(body.value)) {
				throw Object.assign(new TypeError("secret name and value required"), {
					code: "kms-secret-invalid",
				});
			}
			writeJson(response, 201, kms.putSecret(body.name, body.value));
			return;
		}
		const secretMatch =
			/^\/secrets\/([^/]+)(?:\/(access|versions)(?:\/([^/]+)(?:\/(access))?)?)?$/u.exec(
				path,
			);
		if (secretMatch) {
			const name = decodeURIComponent(secretMatch[1] ?? "");
			const action = secretMatch[2];
			const versionId = secretMatch[3]
				? decodeURIComponent(secretMatch[3])
				: undefined;
			const versionAction = secretMatch[4];
			if (method === "GET" && action === undefined) {
				writeJson(response, 200, {
					name,
					versions: kms.listVersions(name),
				});
				return;
			}
			if (
				method === "GET" &&
				action === "versions" &&
				versionId === undefined
			) {
				writeJson(response, 200, { name, versions: kms.listVersions(name) });
				return;
			}
			if (
				(method === "POST" && action === "access") ||
				(method === "POST" &&
					action === "versions" &&
					versionAction === "access")
			) {
				writeJson(response, 200, kms.accessSecret(name, versionId));
				return;
			}
		}
		writeJson(response, 404, { ok: false, error: "not found" });
	} catch (error) {
		if (!(error instanceof Error)) throw error;
		writeJson(response, mapStatus(error), {
			ok: false,
			error: error.message,
			...codeOf(error),
		});
	}
}

function asBox(body: JsonValue | undefined): StationKmsBox {
	if (!body || !isJsonObject(body)) {
		throw Object.assign(new TypeError("ciphertext box required"), {
			code: "kms-payload-invalid",
		});
	}
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const value = body as Partial<StationKmsBox>;
	if (
		!isJsonString(value.ciphertext) ||
		!isJsonString(value.iv) ||
		!isJsonString(value.authTag)
	) {
		throw Object.assign(new TypeError("ciphertext, iv, and authTag required"), {
			code: "kms-payload-invalid",
		});
	}
	return {
		ciphertext: value.ciphertext,
		iv: value.iv,
		authTag: value.authTag,
	};
}

function codeOf(error: Error) {
	if (
		error &&
		Object.prototype.toString.call(error) === "[object Object]" &&
		"code" in error
	) {
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const code = String((error as { code?: JsonValue }).code ?? "");
		return code.length > 0 ? { code } : {};
	}
	return {};
}

function mapStatus(error: Error): number {
	const code = codeOf(error).code ?? "";
	if (code.endsWith("-missing")) return 404;
	if (error instanceof TypeError || code.endsWith("-invalid")) return 400;
	if (code.endsWith("-exists")) return 409;
	if (code.startsWith("kms-")) return 409;
	return 500;
}

async function readJson(request: IncomingMessage): Promise<JsonValue> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	if (chunks.length === 0) return {};
	const raw = Buffer.concat(chunks).toString("utf8").trim();
	if (raw.length === 0) return {};
	return parseJsonValue(raw);
}

function writeJson<T>(
	response: import("node:http").ServerResponse,
	status: number,
	body: T,
): void {
	const payload = `${JSON.stringify(body)}\n`;
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(payload),
	});
	response.end(payload);
}

function listen(server: Server, port: number): Promise<number> {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", () => {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			resolve((server.address() as AddressInfo).port);
		});
	});
}

function closeServer(server: Server): Promise<void> {
	return new Promise((resolve) => {
		server.close(() => resolve());
	});
}
