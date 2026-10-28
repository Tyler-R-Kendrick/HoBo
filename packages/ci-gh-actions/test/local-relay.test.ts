import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toJsonString } from "@bufbuild/protobuf";
import { ConfigurationSchema } from "@hobo/ci";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createCiRelayClient } from "../src/client.js";
import { startRelayFromEnvironment } from "../src/main.js";
import { config, SECRET } from "./fixtures.js";

async function freePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = z.object({ port: z.number() }).parse(server.address());
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
	return address.port;
}

describe("local relay endpoint", () => {
	it.each([
		{ url: "http://127.0.0.1:8787", host: "127.0.0.1", flag: undefined },
		{ url: "http://127.0.0.1:8787", host: "0.0.0.0", flag: "1" },
		{ url: "http://192.168.1.1:8787", host: "127.0.0.1", flag: "1" },
		{ url: "http://localhost.example:8787", host: "127.0.0.1", flag: "1" },
		{ url: "http://localhost:8787/path", host: "127.0.0.1", flag: "1" },
		{ url: "http://localhost:8787?query=1", host: "127.0.0.1", flag: "1" },
		{ url: "http://user@localhost:8787", host: "127.0.0.1", flag: "1" },
	])("rejects untrusted plaintext endpoint or listener $url", async ({
		url,
		host,
		flag,
	}) => {
		await expect(
			startRelayFromEnvironment({
				HOBO_CI_PUBLIC_URL: url,
				HOBO_CI_HOST: host,
				HOBO_CI_ALLOW_INSECURE_LOOPBACK: flag,
			}),
		).rejects.toThrow(/HTTPS origin/);
	});

	it("serves a real authenticated control client over explicitly enabled loopback", async () => {
		const directory = mkdtempSync(join(tmpdir(), "hobo-ci-local-relay-"));
		const keyPath = join(directory, "app-key.pem");
		const tokenPath = join(directory, "tokens.json");
		const configPath = join(directory, "config.json");
		const token = "synthetic-local-account-token-".repeat(2);
		const pair = generateKeyPairSync("rsa", {
			modulusLength: 2048,
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
			publicKeyEncoding: { type: "spki", format: "pem" },
		});
		writeFileSync(keyPath, pair.privateKey, { mode: 0o600 });
		writeFileSync(
			tokenPath,
			JSON.stringify({
				tokens: [
					{
						accountId: "account-a",
						tokenSha256: createHash("sha256").update(token).digest("hex"),
						installationIds: [10],
						scopes: ["policy:read"],
					},
				],
			}),
			{ mode: 0o600 },
		);
		writeFileSync(configPath, toJsonString(ConfigurationSchema, config()));
		const port = await freePort();
		const origin = `http://127.0.0.1:${port}`;
		try {
			const running = await startRelayFromEnvironment({
				HOBO_CI_PUBLIC_URL: origin,
				// `localhost` must be bound to numeric loopback, not resolved by DNS.
				HOBO_CI_HOST: "localhost",
				HOBO_CI_PORT: String(port),
				HOBO_CI_ALLOW_INSECURE_LOOPBACK: "1",
				HOBO_CI_GITHUB_APP_ID: "123",
				HOBO_CI_GITHUB_APP_KEY_FILE: keyPath,
				HOBO_CI_CONTROL_TOKENS_FILE: tokenPath,
				HOBO_CI_WEBHOOK_SECRET: SECRET,
				HOBO_CI_DB: join(directory, "relay.sqlite"),
				HOBO_CI_CONFIG: configPath,
			});
			try {
				await running.service.checkReadiness();
				expect((await fetch(`${origin}/readyz`)).status).toBe(200);
				expect((await fetch(`${origin}/v1/accounts/self/policy`)).status).toBe(
					401,
				);
				const client = createCiRelayClient({
					origin,
					allowInsecureLoopback: true,
					accountToken: () => token,
				});
				const state = await client.getPolicy();
				expect(state.account?.id).toBe("account-a");
				expect(state.account?.budgetMicros).toBe(1000000);
			} finally {
				await running.stop();
			}
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
