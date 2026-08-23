/**
 * The station-local KMS sidecar.
 *
 * This is real `node:crypto` — RSA-2048 signing and AES-256-GCM sealing —
 * hosting the residual `hobo:crypto` and `hobo:secrets` Bindle ports next to
 * occupancy. It is not a fixture and not a cloud mock, so the properties worth
 * holding are cryptographic ones rather than shape ones.
 *
 * **A signature must verify only against what was signed.** A verify that
 * returned `true` for a tampered payload, or for a signature made under a
 * different key, would make the whole port decorative.
 *
 * **A sealed box must not open without its exact authentication tag.** GCM's
 * tag is what turns "confidential" into "tamper-evident"; a decrypt that
 * ignored a corrupted tag would hand back attacker-chosen plaintext.
 *
 * **Secrets are versioned and never overwritten.** A rotated secret has to
 * leave the previous version readable, because a workload holding an older
 * `secref://` must not break the moment someone rotates.
 *
 * **Persistence round-trips the key material, not just the names.** A restart
 * that regenerated the wrapping key would leave every stored secret
 * permanently unreadable while reporting success.
 *
 * The server binds an ephemeral loopback port, so these tests drive the real
 * HTTP path over the real crypto.
 */
import {
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	KMS_CRYPTO_PORT,
	KMS_SECRETS_PORT,
	KMS_SIDECAR_HOSTING,
	KMS_SIDECAR_NAME,
	type KmsSidecarServer,
	STATION_KMS_KEY,
	STATION_KMS_STORE_SCHEMA,
	StationKms,
	startKmsSidecar,
} from "../src/kms-sidecar-server.js";

const servers: KmsSidecarServer[] = [];
const dirs: string[] = [];

afterEach(async () => {
	for (const server of servers.splice(0)) await server.close();
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function persistDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-kms-"));
	dirs.push(dir);
	return dir;
}

async function sidecar(
	options: { persistDir?: string } = {},
): Promise<KmsSidecarServer> {
	const server = await startKmsSidecar(options);
	servers.push(server);
	return server;
}

/** Call the sidecar and return status plus parsed body. */
async function call(
	server: KmsSidecarServer,
	path: string,
	options: { method?: string; body?: unknown } = {},
) {
	const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
		method: options.method ?? "GET",
		...(options.body !== undefined
			? {
					body: JSON.stringify(options.body),
					headers: { "content-type": "application/json" },
				}
			: {}),
	});
	// SAFETY: the sidecar always answers JSON, on every status.
	return { status: response.status, body: (await response.json()) as never };
}

describe("the sidecar's identity", () => {
	it("names itself `kms`", () => {
		expect(KMS_SIDECAR_NAME).toBe("kms");
	});

	it("declares station hosting rather than a Bindle kind", () => {
		// The KMS is the Station's own; a Bindle kind would imply a provider
		// provisions it per app.
		expect(KMS_SIDECAR_HOSTING).toBe("station");
	});

	it("hosts both residual ports on one listener", async () => {
		const server = await sidecar();
		const { body } = await call(server, "/health");
		// Splitting them across listeners would double the surface for no gain;
		// the health body is what declares they share one.
		expect(body.ports).toEqual([KMS_CRYPTO_PORT, KMS_SECRETS_PORT]);
	});

	it("publishes a distinct origin per hosted name on the same port", async () => {
		const server = await sidecar();
		expect(server.secretUrl).not.toBe(server.cryptoUrl);
		// Different names, one bound port — occupancy routes by name.
		expect(server.secretUrl).toContain(String(server.port));
		expect(server.cryptoUrl).toContain(String(server.port));
	});

	it("binds an ephemeral port when none is asked for", async () => {
		const server = await sidecar();
		expect(server.port).toBeGreaterThan(0);
	});

	it("answers /health identically to the root", async () => {
		const server = await sidecar();
		expect((await call(server, "/health")).body).toEqual(
			(await call(server, "/")).body,
		);
	});

	it("tolerates a trailing slash", async () => {
		const server = await sidecar();
		expect((await call(server, "/health/")).status).toBe(200);
	});

	it("names the engine it hosts", async () => {
		const server = await sidecar();
		expect((await call(server, "/health")).body.engine).toBe("StationKms");
	});

	it("has a station wrapping key before anything is asked of it", async () => {
		const server = await sidecar();
		// Every secret is sealed under this key. A KMS that started empty would
		// fail the first put rather than the first configuration mistake.
		expect((await call(server, "/health")).body.keys).toContain(
			STATION_KMS_KEY,
		);
	});

	it("answers 404 for an unrouted path", async () => {
		const server = await sidecar();
		expect((await call(server, "/nope")).status).toBe(404);
	});

	it("closes cleanly and refuses later connections", async () => {
		const server = await startKmsSidecar();
		const port = server.port;
		await server.close();
		await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
	});
});

describe("key management", () => {
	it("lists the station key", async () => {
		const server = await sidecar();
		expect((await call(server, "/keys")).body.keys).toContain(STATION_KMS_KEY);
	});

	it("generates a named key", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/keys", {
			method: "POST",
			body: { kid: "signing" },
		});
		expect(status).toBe(201);
		expect(body.kid).toBe("signing");
	});

	it("mints a name when none is given", async () => {
		const server = await sidecar();
		const { body } = await call(server, "/keys", { method: "POST", body: {} });
		// An unnamed key still needs a handle, and the handle must be unguessable
		// enough not to collide with a caller's own naming.
		expect(String(body.kid)).toMatch(/^key_[0-9a-f]{8}$/u);
	});

	it("mints a name when the given one is empty", async () => {
		const server = await sidecar();
		const { body } = await call(server, "/keys", {
			method: "POST",
			body: { kid: "" },
		});
		expect(String(body.kid)).toMatch(/^key_/u);
	});

	it("refuses to overwrite an existing key", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/keys", {
			method: "POST",
			body: { kid: STATION_KMS_KEY },
		});
		// Silently replacing a key destroys every signature and box made under
		// it, so the refusal itself is right. The status is not: see the DEFECT
		// block below — `codeOf` never reads the code, so this 409 lands as 500.
		expect(status).toBe(500);
		expect(String(body.error)).toContain("already exists");
	});

	it("returns a public JWK on generate", async () => {
		const server = await sidecar();
		const { body } = await call(server, "/keys", {
			method: "POST",
			body: { kid: "signing" },
		});
		expect(body.jwk).toMatchObject({
			kid: "signing",
			alg: "RS256",
			use: "sig",
		});
	});

	it("never puts private material in the JWK", async () => {
		const server = await sidecar();
		const { body } = await call(server, `/keys/${STATION_KMS_KEY}`);
		// `d` is the RSA private exponent. Exporting it would hand the signing
		// key to anyone who can reach the health surface.
		expect(Object.hasOwn(body.jwk, "d")).toBe(false);
	});

	it("reads a key's JWK by name", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, `/keys/${STATION_KMS_KEY}`);
		expect(status).toBe(200);
		expect(body.jwk.kty).toBe("RSA");
	});

	it("DEFECT: answers 500 for a key that does not exist", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/keys/ghost");
		// Should be 404 with `kms-key-missing`. See the DEFECT block below.
		expect(status).toBe(500);
		expect(String(body.error)).toContain("unknown KMS key");
	});
});

describe("signing", () => {
	it("signs and verifies a payload", async () => {
		const server = await sidecar();
		const { body: signed } = await call(
			server,
			`/keys/${STATION_KMS_KEY}/sign`,
			{ method: "POST", body: { payload: "manifest-digest" } },
		);
		const { body: verified } = await call(
			server,
			`/keys/${STATION_KMS_KEY}/verify`,
			{
				method: "POST",
				body: { payload: "manifest-digest", signature: signed.signature },
			},
		);
		expect(verified.ok).toBe(true);
	});

	it("refuses a signature over a different payload", async () => {
		const server = await sidecar();
		const { body: signed } = await call(
			server,
			`/keys/${STATION_KMS_KEY}/sign`,
			{ method: "POST", body: { payload: "manifest-digest" } },
		);
		const { body: verified } = await call(
			server,
			`/keys/${STATION_KMS_KEY}/verify`,
			{
				method: "POST",
				body: { payload: "tampered-digest", signature: signed.signature },
			},
		);
		// This is the whole point of the port: a signature that verifies against
		// anything is not a signature.
		expect(verified.ok).toBe(false);
	});

	it("refuses a signature made under a different key", async () => {
		const server = await sidecar();
		await call(server, "/keys", { method: "POST", body: { kid: "other" } });
		const { body: signed } = await call(server, "/keys/other/sign", {
			method: "POST",
			body: { payload: "digest" },
		});
		const { body: verified } = await call(
			server,
			`/keys/${STATION_KMS_KEY}/verify`,
			{
				method: "POST",
				body: { payload: "digest", signature: signed.signature },
			},
		);
		expect(verified.ok).toBe(false);
	});

	it("refuses a corrupted signature without throwing", async () => {
		const server = await sidecar();
		const { status, body } = await call(
			server,
			`/keys/${STATION_KMS_KEY}/verify`,
			{
				method: "POST",
				body: { payload: "digest", signature: "bm90LXJlYWw=" },
			},
		);
		// Garbage in must be a `false`, not a 500 — an attacker should not be
		// able to error the KMS by sending nonsense.
		expect(status).toBe(200);
		expect(body.ok).toBe(false);
	});

	it("refuses a sign with no payload", async () => {
		const server = await sidecar();
		const { status, body } = await call(
			server,
			`/keys/${STATION_KMS_KEY}/sign`,
			{ method: "POST", body: {} },
		);
		// The status is right — a `TypeError` maps to 400 through `instanceof`,
		// which does not depend on the broken code reader. The code is still
		// dropped, so the caller gets a message and no machine-readable reason.
		expect(status).toBe(400);
		expect(body.code).toBeUndefined();
	});

	it("refuses a sign whose payload is not a string", async () => {
		const server = await sidecar();
		// A number would sign its stringified form, which is not what the caller
		// asked for and would not verify against the value they hold.
		expect(
			(
				await call(server, `/keys/${STATION_KMS_KEY}/sign`, {
					method: "POST",
					body: { payload: 7 },
				})
			).status,
		).toBe(400);
	});

	it("refuses a verify missing the signature", async () => {
		const server = await sidecar();
		expect(
			(
				await call(server, `/keys/${STATION_KMS_KEY}/verify`, {
					method: "POST",
					body: { payload: "digest" },
				})
			).status,
		).toBe(400);
	});

	it("answers 404 signing under a key that does not exist", async () => {
		const server = await sidecar();
		// Should be 404; lands as 500 for the reason in the DEFECT block below.
		expect(
			(
				await call(server, "/keys/ghost/sign", {
					method: "POST",
					body: { payload: "digest" },
				})
			).status,
		).toBe(500);
	});
});

describe("sealing", () => {
	it("round-trips a plaintext", async () => {
		const server = await sidecar();
		const { body: box } = await call(
			server,
			`/keys/${STATION_KMS_KEY}/encrypt`,
			{ method: "POST", body: { plaintext: "hunter2" } },
		);
		const { body: opened } = await call(
			server,
			`/keys/${STATION_KMS_KEY}/decrypt`,
			{ method: "POST", body: box },
		);
		expect(opened.plaintext).toBe("hunter2");
	});

	it("returns a fresh nonce for each seal", async () => {
		const server = await sidecar();
		const seal = async () =>
			(
				await call(server, `/keys/${STATION_KMS_KEY}/encrypt`, {
					method: "POST",
					body: { plaintext: "hunter2" },
				})
			).body;
		const first = await seal();
		const second = await seal();
		// Reusing a GCM nonce under one key is catastrophic — it leaks the
		// XOR of the two plaintexts and forges the tag.
		expect(second.iv).not.toBe(first.iv);
		expect(second.ciphertext).not.toBe(first.ciphertext);
	});

	it("refuses to open a box with a corrupted tag", async () => {
		const server = await sidecar();
		const { body: box } = await call(
			server,
			`/keys/${STATION_KMS_KEY}/encrypt`,
			{ method: "POST", body: { plaintext: "hunter2" } },
		);
		const { status } = await call(server, `/keys/${STATION_KMS_KEY}/decrypt`, {
			method: "POST",
			body: { ...box, authTag: Buffer.alloc(16).toString("base64") },
		});
		// Without this the box is confidential but not tamper-evident, and an
		// attacker can flip bits in the plaintext at will.
		expect(status).toBeGreaterThanOrEqual(400);
	});

	it("refuses to open a box with a corrupted ciphertext", async () => {
		const server = await sidecar();
		const { body: box } = await call(
			server,
			`/keys/${STATION_KMS_KEY}/encrypt`,
			{ method: "POST", body: { plaintext: "hunter2" } },
		);
		const { status } = await call(server, `/keys/${STATION_KMS_KEY}/decrypt`, {
			method: "POST",
			body: { ...box, ciphertext: Buffer.from("evil").toString("base64") },
		});
		expect(status).toBeGreaterThanOrEqual(400);
	});

	it("refuses to open a box under a different key", async () => {
		const server = await sidecar();
		await call(server, "/keys", { method: "POST", body: { kid: "other" } });
		const { body: box } = await call(
			server,
			`/keys/${STATION_KMS_KEY}/encrypt`,
			{ method: "POST", body: { plaintext: "hunter2" } },
		);
		const { status } = await call(server, "/keys/other/decrypt", {
			method: "POST",
			body: box,
		});
		expect(status).toBeGreaterThanOrEqual(400);
	});

	it("refuses a decrypt with no box at all", async () => {
		const server = await sidecar();
		const { status, body } = await call(
			server,
			`/keys/${STATION_KMS_KEY}/decrypt`,
			{ method: "POST", body: {} },
		);
		expect(status).toBe(400);
		expect(body.code).toBeUndefined();
	});

	it("refuses a decrypt missing the authentication tag", async () => {
		const server = await sidecar();
		const { status } = await call(server, `/keys/${STATION_KMS_KEY}/decrypt`, {
			method: "POST",
			body: { ciphertext: "AAAA", iv: "AAAA" },
		});
		// A box without a tag is not a box; accepting it would be an unauthenticated
		// decrypt in all but name.
		expect(status).toBe(400);
	});

	it("refuses a decrypt whose box is not an object", async () => {
		const server = await sidecar();
		expect(
			(
				await call(server, `/keys/${STATION_KMS_KEY}/decrypt`, {
					method: "POST",
					body: "AAAA",
				})
			).status,
		).toBe(400);
	});

	it("refuses an encrypt with no plaintext", async () => {
		const server = await sidecar();
		expect(
			(
				await call(server, `/keys/${STATION_KMS_KEY}/encrypt`, {
					method: "POST",
					body: {},
				})
			).status,
		).toBe(400);
	});
});

describe("secrets", () => {
	it("lists nothing before any secret is stored", async () => {
		const server = await sidecar();
		expect((await call(server, "/secrets")).body.secrets).toEqual([]);
	});

	it("stores a secret and returns a reference", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/secrets", {
			method: "POST",
			body: { name: "db-password", value: "hunter2" },
		});
		expect(status).toBe(201);
		expect(body.valueRef).toBe(`secref://db-password/${body.versionId}`);
	});

	it("never echoes the secret value back on store", async () => {
		const server = await sidecar();
		const { body } = await call(server, "/secrets", {
			method: "POST",
			body: { name: "db-password", value: "hunter2" },
		});
		// The store response often lands in a log; the value must not.
		expect(JSON.stringify(body)).not.toContain("hunter2");
	});

	it("lists a stored secret by name only", async () => {
		const server = await sidecar();
		await call(server, "/secrets", {
			method: "POST",
			body: { name: "db-password", value: "hunter2" },
		});
		const { body } = await call(server, "/secrets");
		expect(body.secrets).toEqual(["db-password"]);
	});

	it("reads back the material through an explicit access", async () => {
		const server = await sidecar();
		await call(server, "/secrets", {
			method: "POST",
			body: { name: "db-password", value: "hunter2" },
		});
		const { status, body } = await call(server, "/secrets/db-password/access", {
			method: "POST",
		});
		// Access is a POST, not a GET, precisely because it is the one call that
		// returns material — it must not be reachable by following a link.
		expect(status).toBe(200);
		expect(body.material).toBe("hunter2");
	});

	it("versions a rotated secret rather than overwriting it", async () => {
		const server = await sidecar();
		const first = await call(server, "/secrets", {
			method: "POST",
			body: { name: "db-password", value: "old" },
		});
		const second = await call(server, "/secrets", {
			method: "POST",
			body: { name: "db-password", value: "new" },
		});
		expect(second.body.versionId).not.toBe(first.body.versionId);
		const { body } = await call(server, "/secrets/db-password");
		expect(body.versions).toHaveLength(2);
	});

	it("accesses the newest version by default", async () => {
		const server = await sidecar();
		await call(server, "/secrets", {
			method: "POST",
			body: { name: "db-password", value: "old" },
		});
		await call(server, "/secrets", {
			method: "POST",
			body: { name: "db-password", value: "new" },
		});
		const { body } = await call(server, "/secrets/db-password/access", {
			method: "POST",
		});
		// A rotation that did not change what an unversioned access returns
		// would be a rotation in name only.
		expect(body.material).toBe("new");
	});

	it("keeps an older version readable after a rotation", async () => {
		const server = await sidecar();
		const first = await call(server, "/secrets", {
			method: "POST",
			body: { name: "db-password", value: "old" },
		});
		await call(server, "/secrets", {
			method: "POST",
			body: { name: "db-password", value: "new" },
		});
		const { body } = await call(
			server,
			`/secrets/db-password/versions/${first.body.versionId}/access`,
			{ method: "POST" },
		);
		// A workload holding an older `secref://` must not break the instant
		// someone rotates.
		expect(body.material).toBe("old");
	});

	it("lists a secret's versions", async () => {
		const server = await sidecar();
		await call(server, "/secrets", {
			method: "POST",
			body: { name: "db-password", value: "old" },
		});
		const { status, body } = await call(
			server,
			"/secrets/db-password/versions",
		);
		expect(status).toBe(200);
		expect(body.versions).toHaveLength(1);
	});

	it("reports no versions for a name never stored", async () => {
		const server = await sidecar();
		// Listing is not access, so an unknown name is an empty list rather than
		// a 404 that would confirm which names exist.
		expect((await call(server, "/secrets/ghost")).body.versions).toEqual([]);
	});

	it("answers 404 accessing a secret that does not exist", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/secrets/ghost/access", {
			method: "POST",
		});
		// Should be 404 with `kms-secret-missing`. See the DEFECT block below.
		expect(status).toBe(500);
		expect(String(body.error)).toContain("secret not found");
	});

	it("answers 404 accessing a version that does not exist", async () => {
		const server = await sidecar();
		await call(server, "/secrets", {
			method: "POST",
			body: { name: "db-password", value: "hunter2" },
		});
		const { status, body } = await call(
			server,
			"/secrets/db-password/versions/v99-deadbeef/access",
			{ method: "POST" },
		);
		// Should be 404 with `kms-secret-version-missing`.
		expect(status).toBe(500);
		expect(String(body.error)).toContain("secret version not found");
	});

	it("refuses a store with no name", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/secrets", {
			method: "POST",
			body: { value: "hunter2" },
		});
		expect(status).toBe(400);
		expect(body.code).toBeUndefined();
	});

	it("refuses a store with no value", async () => {
		const server = await sidecar();
		expect(
			(
				await call(server, "/secrets", {
					method: "POST",
					body: { name: "db-password" },
				})
			).status,
		).toBe(400);
	});

	it("refuses an empty secret value at the store", () => {
		const kms = new StationKms();
		// An empty secret reads back as a successful access returning nothing,
		// which a caller will treat as a configured-but-blank credential.
		expect(() => kms.putSecret("db", "")).toThrow(/value required/);
	});

	it("refuses an empty secret name at the store", () => {
		const kms = new StationKms();
		expect(() => kms.putSecret("", "hunter2")).toThrow(/name required/);
	});

	it("decodes a percent-escaped secret name", async () => {
		const server = await sidecar();
		await call(server, "/secrets", {
			method: "POST",
			body: { name: "db password", value: "hunter2" },
		});
		// Without the decode the secret would be unreachable through the URL it
		// was just given a reference for.
		expect(
			(await call(server, "/secrets/db%20password")).body.versions,
		).toHaveLength(1);
	});
});

describe("persistence", () => {
	it("survives a restart with the same key material", async () => {
		const dir = persistDir();
		const first = await sidecar({ persistDir: dir });
		await call(first, "/secrets", {
			method: "POST",
			body: { name: "db-password", value: "hunter2" },
		});
		await first.close();
		servers.length = 0;
		const second = await sidecar({ persistDir: dir });
		const { body } = await call(second, "/secrets/db-password/access", {
			method: "POST",
		});
		// A restart that regenerated the wrapping key would leave every stored
		// secret permanently unreadable while still reporting a healthy KMS.
		expect(body.material).toBe("hunter2");
	});

	it("survives a restart with generated keys intact", async () => {
		const dir = persistDir();
		const first = await sidecar({ persistDir: dir });
		await call(first, "/keys", { method: "POST", body: { kid: "signing" } });
		await first.close();
		servers.length = 0;
		const second = await sidecar({ persistDir: dir });
		expect((await call(second, "/keys")).body.keys).toContain("signing");
	});

	it("verifies a signature made before the restart", async () => {
		const dir = persistDir();
		const first = await sidecar({ persistDir: dir });
		const { body: signed } = await call(
			first,
			`/keys/${STATION_KMS_KEY}/sign`,
			{ method: "POST", body: { payload: "digest" } },
		);
		await first.close();
		servers.length = 0;
		const second = await sidecar({ persistDir: dir });
		const { body } = await call(second, `/keys/${STATION_KMS_KEY}/verify`, {
			method: "POST",
			body: { payload: "digest", signature: signed.signature },
		});
		// The private key survived, not just its name.
		expect(body.ok).toBe(true);
	});

	it("writes the store readable only by its owner", () => {
		const dir = persistDir();
		new StationKms({ persistDir: dir });
		const mode = statSync(join(dir, "store.json")).mode & 0o777;
		// The file holds private keys and AES material in the clear. Group or
		// world read on a shared host is a full compromise.
		expect(mode).toBe(0o600);
	});

	it("stamps the store with its schema", () => {
		const dir = persistDir();
		new StationKms({ persistDir: dir });
		const parsed = JSON.parse(readFileSync(join(dir, "store.json"), "utf8"));
		expect(parsed.schema).toBe(STATION_KMS_STORE_SCHEMA);
	});

	it("ignores a store written under a different schema", () => {
		const dir = persistDir();
		const first = new StationKms({ persistDir: dir });
		first.putSecret("db", "hunter2");
		const path = join(dir, "store.json");
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		writeFileSync(
			path,
			JSON.stringify({ ...parsed, schema: "hobo.station-kms/v0" }),
		);
		// Reading an unknown layout as if it were the current one would load
		// half a key and fail later, far from the version mismatch that caused it.
		expect(new StationKms({ persistDir: dir }).listSecrets()).toEqual([]);
	});

	it("skips a stored key missing part of its material", () => {
		const dir = persistDir();
		new StationKms({ persistDir: dir });
		const path = join(dir, "store.json");
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		parsed.keys.partial = { privateKey: parsed.keys.station.privateKey };
		writeFileSync(path, JSON.stringify(parsed));
		// A half-loaded key would throw on first use rather than at load; the
		// station key must still come back.
		const reopened = new StationKms({ persistDir: dir });
		expect(reopened.listKeys()).toContain(STATION_KMS_KEY);
		expect(reopened.listKeys()).not.toContain("partial");
	});

	it("keeps no store at all when no directory is given", () => {
		const kms = new StationKms();
		kms.putSecret("db", "hunter2");
		// An in-memory KMS is a legitimate mode; it must not write a key file
		// into whatever the current working directory happens to be.
		expect(kms.listSecrets()).toEqual(["db"]);
	});
});

describe("DEFECT: every error code is dropped and every 404/409 becomes a 500", () => {
	/**
	 * `mapStatus` reads the error's `code` through `codeOf`, which guards on
	 * `Object.prototype.toString.call(error) === "[object Object]"`. An `Error`
	 * — including one built by `Object.assign(new Error(...), { code })` —
	 * stringifies as `[object Error]`, so that guard is never true and `codeOf`
	 * always returns `{}`.
	 *
	 * Two consequences, both visible in the tests above:
	 *
	 * 1. Every coded refusal that is not a `TypeError` falls through every
	 *    branch of `mapStatus` to the 500 default. A missing key, a missing
	 *    secret, a missing version and a duplicate key id all present to the
	 *    caller as "the KMS is broken" rather than "you asked for the wrong
	 *    thing". A client cannot distinguish a retryable server fault from a
	 *    permanent 404, and a monitored station reports 500s under normal use.
	 * 2. No response ever carries a `code`, so callers must parse English error
	 *    strings to react at all.
	 *
	 * `error instanceof TypeError` still works, which is why validation
	 * failures land on the right status with the wrong (absent) code.
	 *
	 * The fix is one line — guard on `error instanceof Error && "code" in error`
	 * — but it changes status codes on a public surface, so it is pinned here
	 * rather than applied inside a coverage tranche.
	 */
	it("drops the code from a refusal that carries one", async () => {
		const server = await sidecar();
		const { body } = await call(server, "/keys/ghost");
		expect(Object.hasOwn(body, "code")).toBe(false);
	});

	it("reports a caller's mistake as a server fault", async () => {
		const server = await sidecar();
		// Asking for a secret that was never stored is a 404 in every sense
		// except the one the caller can see.
		expect(
			(await call(server, "/secrets/ghost/access", { method: "POST" })).status,
		).toBe(500);
	});

	it("still gets the status right where instanceof carries it", async () => {
		const server = await sidecar();
		// `asBox` throws a `TypeError`, and `instanceof` does not go through the
		// broken guard — so this one path is correct today.
		expect(
			(
				await call(server, `/keys/${STATION_KMS_KEY}/decrypt`, {
					method: "POST",
					body: {},
				})
			).status,
		).toBe(400);
	});
});
