import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	residentProxyEnvironment,
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

function agentFrame(type: number): Buffer {
	const frame = Buffer.alloc(5);
	frame.writeUInt32BE(1, 0);
	frame[4] = type;
	return frame;
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
		await new Promise<void>((resolve, reject) => {
			const client = createConnection(proxyPath);
			client.once("error", reject);
			client.once("connect", () => client.end(resolve));
		});
		expect(redeemed).toEqual([]);
		const request = agentFrame(13);
		const echoed = await new Promise<Buffer>((resolve, reject) => {
			const client = createConnection(proxyPath);
			client.once("error", reject);
			client.once("connect", () => client.write(request));
			client.once("data", (data) => {
				resolve(data);
				client.end();
			});
		});
		expect(echoed).toEqual(request);
		expect(redeemed).toEqual(["redeemed"]);
		await proxy.close();
		await new Promise<void>((resolve, reject) =>
			upstream.close((error) => (error ? reject(error) : resolve())),
		);
	});

	it("does not pass launcher secrets to the detached proxy", () => {
		expect(residentProxyEnvironment()).toEqual({});
	});

	it("does not forward a signing request when audit persistence fails", async () => {
		const dir = root();
		const upstreamPath = join(dir, "upstream.sock");
		const proxyPath = join(dir, "proxy.sock");
		const received: Buffer[] = [];
		const upstream = createServer((socket) =>
			socket.on("data", (data) => received.push(data)),
		);
		await new Promise<void>((resolve, reject) => {
			upstream.once("error", reject);
			upstream.listen(upstreamPath, resolve);
		});
		const proxy = await startSshAgentProxy({
			socketPath: proxyPath,
			upstreamSocket: upstreamPath,
			expiresAt: new Date(Date.now() + 60_000).toISOString(),
			onRedeem: async () => {
				throw new Error("audit unavailable");
			},
		});
		await new Promise<void>((resolve) => {
			const client = createConnection(proxyPath);
			client.once("connect", () => client.write(agentFrame(13)));
			client.once("error", () => resolve());
			client.once("close", () => resolve());
		});
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(Buffer.concat(received)).toHaveLength(0);
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
			client.once("connect", () => client.end(agentFrame(13), resolve));
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
