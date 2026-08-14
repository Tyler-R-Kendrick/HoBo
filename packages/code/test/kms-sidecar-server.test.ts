import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	STATION_KMS_KEY,
	StationKms,
	startKmsSidecar,
} from "../src/kms-sidecar-server.js";
import { loopbackFetchUrl } from "../src/occupancy-endpoints.js";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	dirs.length = 0;
});

describe("Station KMS sidecar", () => {
	it("hosts a real RSA/AES KMS and residual secrets store", async () => {
		const server = await startKmsSidecar({ port: 0 });
		try {
			expect(server.url).toMatch(/kms\.code\..*\.hobo\.localhost/);
			expect(server.secretUrl).toMatch(/secret\.code\..*\.hobo\.localhost/);
			expect(server.cryptoUrl).toMatch(/crypto\.code\..*\.hobo\.localhost/);
			const origin = loopbackFetchUrl(server.url);
			const health = (await (await fetch(origin)).json()) as {
				name: string;
				hosting: string;
				ports: string[];
				live: boolean;
				engine: string;
				keys: string[];
			};
			expect(health).toMatchObject({
				name: "kms",
				hosting: "station",
				engine: "StationKms",
				live: true,
			});
			expect(health.ports).toEqual(
				expect.arrayContaining(["hobo:crypto", "hobo:secrets"]),
			);
			expect(health.keys).toContain(STATION_KMS_KEY);

			const signed = (await (
				await fetch(new URL(`/keys/${STATION_KMS_KEY}/sign`, origin), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ payload: "hello-station" }),
				})
			).json()) as { signature: string };
			const verified = (await (
				await fetch(new URL(`/keys/${STATION_KMS_KEY}/verify`, origin), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						payload: "hello-station",
						signature: signed.signature,
					}),
				})
			).json()) as { ok: boolean };
			expect(verified.ok).toBe(true);

			const box = (await (
				await fetch(new URL(`/keys/${STATION_KMS_KEY}/encrypt`, origin), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ plaintext: "bindle-secret" }),
				})
			).json()) as { ciphertext: string; iv: string; authTag: string };
			expect(box.ciphertext).not.toContain("bindle-secret");
			const opened = (await (
				await fetch(new URL(`/keys/${STATION_KMS_KEY}/decrypt`, origin), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(box),
				})
			).json()) as { plaintext: string };
			expect(opened.plaintext).toBe("bindle-secret");

			const put = (await (
				await fetch(new URL("/secrets", origin), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name: "db-pass", value: "s3cret" }),
				})
			).json()) as { versionId: string; valueRef: string };
			expect(put.valueRef).toMatch(/^secref:\/\/db-pass\//);
			expect(JSON.stringify(put)).not.toContain("s3cret");
			const listed = (await (
				await fetch(new URL("/secrets", origin))
			).json()) as { secrets: string[] };
			expect(listed.secrets).toEqual(["db-pass"]);
			const access = (await (
				await fetch(new URL("/secrets/db-pass/access", origin), {
					method: "POST",
				})
			).json()) as { material: string; valueRef: string };
			expect(access.material).toBe("s3cret");
			expect(access.valueRef).toBe(put.valueRef);
		} finally {
			await server.close();
		}
	});

	it("reloads sealed keys and secrets from the Station persist dir", () => {
		const dir = mkdtempSync(join(tmpdir(), "hobo-kms-"));
		dirs.push(dir);
		const first = new StationKms({ persistDir: dir });
		first.putSecret("token", "abc123");
		const signature = first.sign(STATION_KMS_KEY, "round-trip");
		const second = new StationKms({ persistDir: dir });
		expect(second.verify(STATION_KMS_KEY, "round-trip", signature)).toBe(true);
		expect(second.accessSecret("token").material).toBe("abc123");
	});
});
