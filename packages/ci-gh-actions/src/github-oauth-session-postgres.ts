import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import type { GithubOAuthSessionStore } from "./github-oauth-session.js";

const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const Account = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const StateSecret = z
	.object({
		verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
		controlToken: z.string().min(32).max(1024),
	})
	.strict();
const SessionSecret = z
	.object({
		githubToken: z.string().min(1).max(4096),
		controlToken: z.string().min(32).max(1024),
	})
	.strict();
const StateRow = z.object({
	account_id: Account,
	secret: z.instanceof(Buffer),
});
const SessionRow = z.object({
	account_id: Account,
	github_id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
	secret: z.instanceof(Buffer),
});

/** Persistent OAuth state and short-lived sessions. The encryption key must be supplied by the platform secret manager. */
export class PostgresGithubOAuthSessionStore
	implements GithubOAuthSessionStore
{
	private initialization: Promise<void> | undefined;
	private readonly key: Buffer;
	constructor(
		private readonly pool: Pool,
		key: Uint8Array,
	) {
		if (key.byteLength !== 32)
			throw new Error("session encryption key must be 32 bytes");
		this.key = Buffer.from(key);
	}
	async initialize(): Promise<void> {
		this.initialization ??= this.initializeOnce().catch(() => {
			this.initialization = undefined;
			throw new Error("session store initialization failed");
		});
		return this.initialization;
	}
	private async initializeOnce() {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN");
			await client.query(
				"SELECT pg_advisory_xact_lock(hashtext('hobo-ci-oauth-session-v1'))",
			);
			await client.query(
				"CREATE TABLE IF NOT EXISTS hobo_ci_oauth_states (digest text PRIMARY KEY, browser_digest text NOT NULL, account_id text NOT NULL, secret bytea NOT NULL, expires_ms bigint NOT NULL)",
			);
			await client.query(
				"CREATE TABLE IF NOT EXISTS hobo_ci_oauth_sessions (digest text PRIMARY KEY, account_id text NOT NULL, github_id bigint NOT NULL, secret bytea NOT NULL, expires_ms bigint NOT NULL)",
			);
			await client.query(
				"CREATE INDEX IF NOT EXISTS hobo_ci_oauth_states_expires_idx ON hobo_ci_oauth_states(expires_ms)",
			);
			await client.query(
				"CREATE INDEX IF NOT EXISTS hobo_ci_oauth_sessions_expires_idx ON hobo_ci_oauth_sessions(expires_ms)",
			);
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	}
	private seal(
		kind: string,
		digest: string,
		value: z.infer<typeof StateSecret> | z.infer<typeof SessionSecret>,
	): Buffer {
		const iv = randomBytes(12),
			cipher = createCipheriv("aes-256-gcm", this.key, iv);
		cipher.setAAD(Buffer.from(`hobo-ci-oauth:v1:${kind}:${digest}`));
		return Buffer.concat([
			Buffer.from([1]),
			iv,
			cipher.update(JSON.stringify(value)),
			cipher.final(),
			cipher.getAuthTag(),
		]);
	}
	private open<T>(
		kind: string,
		digest: string,
		value: Buffer,
		schema: z.ZodType<T>,
	): T {
		if (value.length < 30 || value[0] !== 1)
			throw new Error("invalid encrypted session");
		try {
			const cipher = createDecipheriv(
				"aes-256-gcm",
				this.key,
				value.subarray(1, 13),
			);
			cipher.setAAD(Buffer.from(`hobo-ci-oauth:v1:${kind}:${digest}`));
			cipher.setAuthTag(value.subarray(value.length - 16));
			return schema.parse(
				JSON.parse(
					Buffer.concat([
						cipher.update(value.subarray(13, value.length - 16)),
						cipher.final(),
					]).toString("utf8"),
				),
			);
		} catch {
			throw new Error("unable to decrypt session");
		}
	}
	async issueState(
		digest: string,
		browserDigest: string,
		accountId: string,
		verifier: string,
		controlToken: string,
		expiresAt: number,
	) {
		Digest.parse(digest);
		Digest.parse(browserDigest);
		Account.parse(accountId);
		const value = StateSecret.parse({ verifier, controlToken });
		if (!Number.isSafeInteger(expiresAt) || expiresAt < 0)
			throw new Error("invalid state expiry");
		await this.initialize();
		await this.pool.query(
			"INSERT INTO hobo_ci_oauth_states (digest,browser_digest,account_id,secret,expires_ms) VALUES ($1,$2,$3,$4,$5)",
			[
				digest,
				browserDigest,
				accountId,
				this.seal("state", digest, value),
				expiresAt,
			],
		);
	}
	async consumeState(digest: string, browserDigest: string, now: number) {
		Digest.parse(digest);
		Digest.parse(browserDigest);
		if (!Number.isSafeInteger(now) || now < 0) throw new Error("invalid clock");
		await this.initialize();
		const result = await this.pool.query(
			"DELETE FROM hobo_ci_oauth_states WHERE digest=$1 AND browser_digest=$2 AND expires_ms>$3 RETURNING account_id,secret",
			[digest, browserDigest, now],
		);
		if (result.rowCount !== 1) return undefined;
		const row = StateRow.parse(result.rows[0]);
		return {
			accountId: row.account_id,
			...this.open("state", digest, row.secret, StateSecret),
		};
	}
	async issueSession(
		digest: string,
		accountId: string,
		githubId: number,
		githubToken: string,
		controlToken: string,
		expiresAt: number,
	) {
		Digest.parse(digest);
		Account.parse(accountId);
		z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(githubId);
		const value = SessionSecret.parse({ githubToken, controlToken });
		if (!Number.isSafeInteger(expiresAt) || expiresAt < 0)
			throw new Error("invalid session expiry");
		await this.initialize();
		await this.pool.query(
			"INSERT INTO hobo_ci_oauth_sessions (digest,account_id,github_id,secret,expires_ms) VALUES ($1,$2,$3,$4,$5)",
			[
				digest,
				accountId,
				githubId,
				this.seal("session", digest, value),
				expiresAt,
			],
		);
	}
	async session(digest: string, now: number) {
		Digest.parse(digest);
		if (!Number.isSafeInteger(now) || now < 0) throw new Error("invalid clock");
		await this.initialize();
		const result = await this.pool.query(
			"SELECT account_id,github_id,secret FROM hobo_ci_oauth_sessions WHERE digest=$1 AND expires_ms>$2",
			[digest, now],
		);
		if (result.rowCount !== 1) return undefined;
		const row = SessionRow.parse(result.rows[0]);
		return {
			accountId: row.account_id,
			githubId: row.github_id,
			...this.open("session", digest, row.secret, SessionSecret),
		};
	}
	/** Clean only expired state/session records; no active login is affected. */
	async cleanup(now: number) {
		if (!Number.isSafeInteger(now) || now < 0) throw new Error("invalid clock");
		await this.initialize();
		await this.pool.query(
			"DELETE FROM hobo_ci_oauth_states WHERE expires_ms<=$1",
			[now],
		);
		await this.pool.query(
			"DELETE FROM hobo_ci_oauth_sessions WHERE expires_ms<=$1",
			[now],
		);
	}
}
