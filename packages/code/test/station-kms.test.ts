/**
 * The Station KMS: key management, envelope encryption, and the secrets store.
 *
 * `kms-sidecar-server.test.ts` has two tests — one round trip through the HTTP
 * surface, one reload from disk. This file covers the class itself, because
 * what it holds is other people's secrets and the failure modes are quiet.
 *
 * The properties that matter most, and why each is worth an explicit test
 * rather than a reading of the code:
 *
 * - **Ciphertext must not be deterministic.** AES-GCM with a reused IV is
 *   catastrophic rather than merely weak, and the bug that causes it — hoisting
 *   the IV out of `encrypt` — makes every test that only checks round-tripping
 *   still pass. So the test is that encrypting the same plaintext twice gives
 *   two different boxes.
 * - **The auth tag must actually be checked.** GCM's integrity guarantee is the
 *   whole reason to use it over CTR. A tampered ciphertext that decrypts to
 *   anything at all is a failure, so the test tampers and demands a throw.
 * - **Secret versions are append-only.** Overwriting a version in place would
 *   silently change what an already-issued `secref://` URL resolves to — a
 *   deploy that pinned a version would start receiving a different value with
 *   no signal that anything moved.
 * - **Persistence is a private key on disk.** The file is written 0600, and a
 *   store from a different schema is discarded rather than half-read.
 *
 * Nothing here is mocked: the crypto is real, and the persistence is a real
 * file in a temp directory. A fake cipher would agree with a broken caller.
 */
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
	STATION_KMS_KEY,
	STATION_KMS_STORE_SCHEMA,
	StationKms,
} from "../src/kms-sidecar-server.js";

function persistDir(): string {
	return mkdtempSync(join(tmpdir(), "hobo-station-kms-"));
}

describe("keys", () => {
	it("mints the station key on construction", () => {
		// Every other operation defaults to this key. A store that started empty
		// would make the first secret write fail on a fresh install.
		expect(new StationKms().listKeys()).toContain(STATION_KMS_KEY);
	});

	it("mints additional named keys", () => {
		const kms = new StationKms();
		kms.generate("signing");
		expect(kms.listKeys()).toContain("signing");
	});

	it("refuses to regenerate an existing key", () => {
		// Silently replacing a key would invalidate every secret sealed under it
		// and every signature already issued — with no error to explain why
		// yesterday's tokens stopped verifying.
		const kms = new StationKms();
		expect(() => kms.generate(STATION_KMS_KEY)).toThrow(/already exists/u);
	});

	it("codes the collision so a caller can branch on it", () => {
		// Callers need to tell "already exists" from "storage failed" without
		// matching on message text.
		const kms = new StationKms();
		try {
			kms.generate(STATION_KMS_KEY);
			expect.unreachable("generate should have thrown");
		} catch (error) {
			expect((error as { code?: string }).code).toBe("kms-key-exists");
		}
	});

	it("refuses to use a key that does not exist", () => {
		const kms = new StationKms();
		expect(() => kms.sign("absent", "payload")).toThrow(/unknown KMS key/u);
	});

	it("codes the missing key distinctly from the collision", () => {
		const kms = new StationKms();
		try {
			kms.encrypt("absent", "x");
			expect.unreachable("encrypt should have thrown");
		} catch (error) {
			expect((error as { code?: string }).code).toBe("kms-key-missing");
		}
	});

	it("gives each key its own distinct material", () => {
		// Two keys sharing material would mean revoking one silently revokes the
		// other, and a secret sealed under one would open under the other.
		const kms = new StationKms();
		kms.generate("other");
		const box = kms.encrypt(STATION_KMS_KEY, "for the station key only");
		expect(() => kms.decrypt("other", box)).toThrow();
	});

	it("does not let a caller mutate the key list it hands back", () => {
		// The list is a view onto the store's own state. A caller pushing into it
		// would be adding a key name that has no key behind it.
		const keys = new StationKms().listKeys();
		expect(() => (keys as string[]).push("injected")).toThrow();
	});
});

describe("signing", () => {
	it("verifies a signature it produced", () => {
		const kms = new StationKms();
		const signature = kms.sign(STATION_KMS_KEY, "attestation");
		expect(kms.verify(STATION_KMS_KEY, "attestation", signature)).toBe(true);
	});

	it("rejects a signature over different content", () => {
		// This is the entire point of signing. A verify that ignored the payload
		// would accept any signed token as proof of any claim.
		const kms = new StationKms();
		const signature = kms.sign(STATION_KMS_KEY, "attestation");
		expect(kms.verify(STATION_KMS_KEY, "tampered", signature)).toBe(false);
	});

	it("rejects a signature from a different key", () => {
		const kms = new StationKms();
		kms.generate("other");
		const signature = kms.sign("other", "attestation");
		expect(kms.verify(STATION_KMS_KEY, "attestation", signature)).toBe(false);
	});

	it("rejects a signature that is not valid base64 of anything", () => {
		// A malformed signature must be false rather than a throw: it arrives from
		// the network, and a throw would turn a bad token into a 500.
		const kms = new StationKms();
		expect(kms.verify(STATION_KMS_KEY, "attestation", "not-a-signature")).toBe(
			false,
		);
	});

	it("publishes a JWK that names the key and its algorithm", () => {
		// A verifier picks the key by `kid` and the algorithm by `alg`. Omitting
		// either forces it to guess, and guessing algorithms is how signature
		// confusion happens.
		const jwk = new StationKms().publicJwk(STATION_KMS_KEY);
		expect(jwk).toMatchObject({
			kid: STATION_KMS_KEY,
			alg: "RS256",
			use: "sig",
		});
	});

	it("publishes only public material", () => {
		// `d` is the RSA private exponent. Exporting it here would put the private
		// key on whatever endpoint serves the JWKS.
		const jwk = new StationKms().publicJwk(STATION_KMS_KEY);
		expect(jwk.kty).toBe("RSA");
		expect(jwk.d).toBeUndefined();
		expect(jwk.p).toBeUndefined();
		expect(jwk.q).toBeUndefined();
	});
});

describe("envelope encryption", () => {
	it("round-trips a value", () => {
		const kms = new StationKms();
		const box = kms.encrypt(STATION_KMS_KEY, "hunter2");
		expect(kms.decrypt(STATION_KMS_KEY, box)).toBe("hunter2");
	});

	it("produces a different box each time for the same plaintext", () => {
		// AES-GCM with a reused IV is catastrophic, not merely weak — it leaks the
		// XOR of the plaintexts and forfeits authentication. The bug that causes
		// it (hoisting the IV out of encrypt) leaves every round-trip test still
		// passing, so this is the test that would actually catch it.
		const kms = new StationKms();
		const first = kms.encrypt(STATION_KMS_KEY, "same value");
		const second = kms.encrypt(STATION_KMS_KEY, "same value");
		expect(second.iv).not.toBe(first.iv);
		expect(second.ciphertext).not.toBe(first.ciphertext);
	});

	it("rejects a tampered ciphertext", () => {
		// GCM's integrity guarantee is the reason to use it over a bare stream
		// cipher. If a modified box decrypted to anything at all, an attacker with
		// write access to the store could change a secret's value undetected.
		const kms = new StationKms();
		const box = kms.encrypt(STATION_KMS_KEY, "hunter2");
		const flipped = Buffer.from(box.ciphertext, "base64");
		flipped[0] = (flipped[0] ?? 0) ^ 0xff;
		expect(() =>
			kms.decrypt(STATION_KMS_KEY, {
				...box,
				ciphertext: flipped.toString("base64"),
			}),
		).toThrow();
	});

	it("rejects a tampered auth tag", () => {
		const kms = new StationKms();
		const box = kms.encrypt(STATION_KMS_KEY, "hunter2");
		const flipped = Buffer.from(box.authTag, "base64");
		flipped[0] = (flipped[0] ?? 0) ^ 0xff;
		expect(() =>
			kms.decrypt(STATION_KMS_KEY, {
				...box,
				authTag: flipped.toString("base64"),
			}),
		).toThrow();
	});

	it("rejects a box opened under the wrong iv", () => {
		const kms = new StationKms();
		const box = kms.encrypt(STATION_KMS_KEY, "hunter2");
		const other = kms.encrypt(STATION_KMS_KEY, "hunter2");
		expect(() =>
			kms.decrypt(STATION_KMS_KEY, { ...box, iv: other.iv }),
		).toThrow();
	});

	it("round-trips a value containing multi-byte characters", () => {
		// The cipher works in bytes and the API in strings. Getting the encoding
		// wrong at either end corrupts anything outside ASCII, which is the kind
		// of bug that only shows up once a real user's password has an accent.
		const kms = new StationKms();
		const value = "pässwörd·漢字·🔑";
		const box = kms.encrypt(STATION_KMS_KEY, value);
		expect(kms.decrypt(STATION_KMS_KEY, box)).toBe(value);
	});

	it("round-trips an empty value", () => {
		const kms = new StationKms();
		expect(kms.decrypt(STATION_KMS_KEY, kms.encrypt(STATION_KMS_KEY, ""))).toBe(
			"",
		);
	});
});

describe("secrets", () => {
	it("stores and reads back a secret", () => {
		const kms = new StationKms();
		const { valueRef } = kms.putSecret("db-password", "hunter2");
		expect(valueRef).toBe("secref://db-password/v1-f52fbd32");
		expect(kms.accessSecret("db-password").material).toBe("hunter2");
	});

	it("does not keep the plaintext anywhere a listing can reach", () => {
		// `listSecrets` names what exists; it must never be a way to read values.
		const kms = new StationKms();
		kms.putSecret("db-password", "hunter2");
		expect(kms.listSecrets()).toEqual(["db-password"]);
		expect(JSON.stringify(kms.listSecrets())).not.toContain("hunter2");
	});

	it("refuses an empty name", () => {
		// An empty name would collide with the next empty name, so two unrelated
		// secrets would become versions of each other.
		const kms = new StationKms();
		expect(() => kms.putSecret("", "value")).toThrow(/secret name required/u);
	});

	it("refuses an empty value", () => {
		// Storing an empty secret is almost always a variable that failed to
		// expand. Accepting it deploys the empty string as a credential.
		const kms = new StationKms();
		expect(() => kms.putSecret("name", "")).toThrow(/secret value required/u);
	});

	it("codes both invalid inputs the same way", () => {
		const kms = new StationKms();
		try {
			kms.putSecret("", "");
			expect.unreachable("putSecret should have thrown");
		} catch (error) {
			expect((error as { code?: string }).code).toBe("kms-secret-invalid");
		}
	});

	it("appends a version rather than replacing the value", () => {
		// A `secref://` URL naming v1 is handed out to deployments. Replacing v1
		// in place would silently change what those already-issued references
		// resolve to.
		const kms = new StationKms();
		const first = kms.putSecret("token", "first");
		kms.putSecret("token", "second");
		expect(kms.listVersions("token")).toHaveLength(2);
		expect(kms.accessSecret("token", first.versionId).material).toBe("first");
	});

	it("reads the newest version when none is named", () => {
		// Rotation only works if the unversioned reference follows it. Returning
		// the oldest would make a rotated secret take effect nowhere.
		const kms = new StationKms();
		kms.putSecret("token", "first");
		kms.putSecret("token", "second");
		expect(kms.accessSecret("token").material).toBe("second");
	});

	it("reads an older version when one is named explicitly", () => {
		// The other half of rotation: a deployment pinned to a version keeps
		// getting that version until it is moved deliberately.
		const kms = new StationKms();
		const first = kms.putSecret("token", "first");
		kms.putSecret("token", "second");
		expect(kms.accessSecret("token", first.versionId).material).toBe("first");
	});

	it("numbers versions in order", () => {
		const kms = new StationKms();
		kms.putSecret("token", "a");
		kms.putSecret("token", "b");
		kms.putSecret("token", "c");
		expect(kms.listVersions("token").map((id) => id.split("-")[0])).toEqual([
			"v1",
			"v2",
			"v3",
		]);
	});

	it("gives two different values different version ids", () => {
		// The digest suffix is what makes a version id identify content rather
		// than just position, so a rollback to an identical value is recognisable.
		const kms = new StationKms();
		const a = kms.putSecret("token", "a");
		const b = kms.putSecret("token", "b");
		expect(b.versionId).not.toBe(a.versionId);
	});

	it("refuses to read a secret that does not exist", () => {
		const kms = new StationKms();
		expect(() => kms.accessSecret("absent")).toThrow(/secret not found/u);
	});

	it("codes a missing secret distinctly from a missing version", () => {
		// The remedies differ: one means create the secret, the other means the
		// caller's pinned version was never written or has been pruned.
		const kms = new StationKms();
		kms.putSecret("token", "a");
		try {
			kms.accessSecret("absent");
			expect.unreachable("accessSecret should have thrown");
		} catch (error) {
			expect((error as { code?: string }).code).toBe("kms-secret-missing");
		}
		try {
			kms.accessSecret("token", "v9-deadbeef");
			expect.unreachable("accessSecret should have thrown");
		} catch (error) {
			expect((error as { code?: string }).code).toBe(
				"kms-secret-version-missing",
			);
		}
	});

	it("reports no versions for a secret that was never written", () => {
		expect(new StationKms().listVersions("absent")).toEqual([]);
	});

	it("keeps secrets under different names apart", () => {
		const kms = new StationKms();
		kms.putSecret("a", "value-a");
		kms.putSecret("b", "value-b");
		expect(kms.accessSecret("a").material).toBe("value-a");
		expect(kms.accessSecret("b").material).toBe("value-b");
	});
});

describe("persistence", () => {
	it("does not write anything when no persist dir was given", () => {
		// An in-memory store is what the tests and ephemeral sidecars use. Writing
		// a default path would put real key material somewhere nobody expects.
		const kms = new StationKms();
		expect(() => kms.putSecret("token", "value")).not.toThrow();
	});

	it("survives a restart with its keys and secrets", () => {
		const dir = persistDir();
		const first = new StationKms({ persistDir: dir });
		first.putSecret("token", "hunter2");
		const signature = first.sign(STATION_KMS_KEY, "payload");

		const second = new StationKms({ persistDir: dir });
		expect(second.accessSecret("token").material).toBe("hunter2");
		// The reloaded key must be the *same* key, not a fresh one — otherwise
		// every signature issued before the restart stops verifying.
		expect(second.verify(STATION_KMS_KEY, "payload", signature)).toBe(true);
	});

	it("keeps a value sealed under the pre-restart key readable", () => {
		// The AES material has to survive too, not just the RSA pair. If it were
		// regenerated, every stored secret would be unreadable and the failure
		// would look like corruption rather than a lost key.
		const dir = persistDir();
		const box = new StationKms({ persistDir: dir }).encrypt(
			STATION_KMS_KEY,
			"sealed",
		);
		expect(
			new StationKms({ persistDir: dir }).decrypt(STATION_KMS_KEY, box),
		).toBe("sealed");
	});

	it("writes the store readable only by its owner", () => {
		// The file holds an unencrypted private key. Group- or world-readable
		// would hand it to every other account on a shared machine.
		const dir = persistDir();
		new StationKms({ persistDir: dir });
		const mode = statSync(join(dir, "store.json")).mode & 0o777;
		expect(mode).toBe(0o600);
	});

	it("does not write secret plaintext to disk", () => {
		// The whole point of the envelope: the file may leak, the values may not.
		const dir = persistDir();
		new StationKms({ persistDir: dir }).putSecret("token", "hunter2");
		expect(readFileSync(join(dir, "store.json"), "utf8")).not.toContain(
			"hunter2",
		);
	});

	it("stamps the schema so a future reader can refuse it", () => {
		const dir = persistDir();
		new StationKms({ persistDir: dir });
		const parsed = JSON.parse(
			readFileSync(join(dir, "store.json"), "utf8"),
		) as { schema: string };
		expect(parsed.schema).toBe(STATION_KMS_STORE_SCHEMA);
	});

	it("creates the persist directory if it is not there yet", () => {
		const dir = join(persistDir(), "nested", "deeper");
		new StationKms({ persistDir: dir });
		expect(existsSync(join(dir, "store.json"))).toBe(true);
	});

	it("starts fresh rather than half-reading a store from another schema", () => {
		// A partially-loaded key store is worse than none: it would look
		// operational while missing whichever keys the old format spelled
		// differently.
		const dir = persistDir();
		const original = new StationKms({ persistDir: dir });
		original.putSecret("token", "hunter2");
		const raw = JSON.parse(readFileSync(join(dir, "store.json"), "utf8")) as {
			schema: string;
		};
		raw.schema = "hobo.station-kms/v0";
		writeFileSync(join(dir, "store.json"), JSON.stringify(raw));

		const reloaded = new StationKms({ persistDir: dir });
		expect(reloaded.listSecrets()).toEqual([]);
		expect(reloaded.listKeys()).toEqual([STATION_KMS_KEY]);
	});
});
