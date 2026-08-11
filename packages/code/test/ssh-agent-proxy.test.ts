import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	runResidentSshAgentProxy,
	startSshAgentProxy,
} from "../src/ssh-agent-proxy.js";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function root(): string {
	const value = mkdtempSync(join(tmpdir(), "hobo-tokenref-agent-"));
	roots.push(value);
	return value;
}

describe("lease-bound SSH agent proxy", () => {
	it("forwards the SSH agent protocol without copying credentials", async () => {
		const dir = root();
		const upstreamPath = join(dir, "upstream.sock");
		const proxyPath = join(dir, "proxy.sock");
		const upstream = createServer((socket) => socket.pipe(socket));
		await new Promise<void>((resolve, reject) => {
			upstream.once("error", reject);
			upstream.listen(upstreamPath, resolve);
		});
		const redeemed: string[] = [];
		const proxy = await startSshAgentProxy({
			socketPath: proxyPath,
			upstreamSocket: upstreamPath,
			expiresAt: new Date(Date.now() + 60_000).toISOString(),
			onRedeem: () => redeemed.push("redeemed"),
		});
		const echoed = await new Promise<string>((resolve, reject) => {
			const client = createConnection(proxyPath);
			client.once("error", reject);
			client.once("connect", () => client.write("ssh-agent-frame"));
			client.once("data", (data) => {
				resolve(data.toString("utf8"));
				client.end();
			});
		});
		expect(echoed).toBe("ssh-agent-frame");
		expect(redeemed).toEqual(["redeemed"]);
		await proxy.close();
		await new Promise<void>((resolve, reject) =>
			upstream.close((error) => (error ? reject(error) : resolve())),
		);
	});

	it("refuses an expired Station lease", async () => {
		const dir = root();
		await expect(
			startSshAgentProxy({
				socketPath: join(dir, "proxy.sock"),
				upstreamSocket: join(dir, "upstream.sock"),
				expiresAt: new Date(Date.now() - 1).toISOString(),
			}),
		).rejects.toThrow("expired or invalid");
	});

	it("drains redemption and lease-end facts to the Station audit feed", async () => {
		const dir = root();
		const upstreamPath = join(dir, "upstream.sock");
		const proxyPath = join(dir, "proxy.sock");
		const auditPath = join(dir, "pam-audit.jsonl");
		const upstream = createServer((socket) => socket.pipe(socket));
		await new Promise<void>((resolve, reject) => {
			upstream.once("error", reject);
			upstream.listen(upstreamPath, resolve);
		});
		const payload = Buffer.from(
			JSON.stringify({
				socketPath: proxyPath,
				upstreamSocket: upstreamPath,
				expiresAt: new Date(Date.now() + 120).toISOString(),
				auditPath,
				stationId: "station:local",
				tenant: "acme",
				sessionId: "session-1",
				subject: "hobo-code",
				target: "ssh:build-box",
				isolationClass: "development",
				credentialRef: "tokenref://pam/native/session-1",
			}),
		).toString("base64url");
		const resident = runResidentSshAgentProxy(payload);
		await new Promise((resolve) => setTimeout(resolve, 20));
		await new Promise<void>((resolve, reject) => {
			const client = createConnection(proxyPath);
			client.once("error", reject);
			client.once("connect", () => client.end(resolve));
		});
		expect(await resident).toBe(0);
		const audit = readFileSync(auditPath, "utf8");
		expect(audit).toContain('"type":"pam.CredentialRedeemed"');
		expect(audit).toContain('"type":"pam.SessionEnded"');
		expect(audit).not.toContain("sessionToken");
		await new Promise<void>((resolve, reject) =>
			upstream.close((error) => (error ? reject(error) : resolve())),
		);
	});
});
