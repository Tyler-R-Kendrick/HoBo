import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import type {
	AppRegistrationStatePort,
	AppRegistrationVaultPort,
} from "./app-registration.js";

const Credentials = z.object({
	pem: z.string().min(1),
	webhookSecret: z.string().min(1),
	clientId: z.string().min(1),
	clientSecret: z.string().min(1),
});
const Envelope = z.object({ ciphertext: z.instanceof(Buffer) });
const Owner = z.object({ account_id: z.string() });
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const Account = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const Id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** PostgreSQL is authoritative across Functions. Supply a 32-byte secret-manager key. */
export class PostgresAppRegistration
	implements AppRegistrationStatePort, AppRegistrationVaultPort
{
	private readonly key: Buffer;
	private initialization: Promise<void> | undefined;
	constructor(
		private readonly pool: Pool,
		key: Uint8Array,
	) {
		if (key.byteLength !== 32)
			throw new Error("registration encryption key must be 32 bytes");
		this.key = Buffer.from(key);
	}
	async initialize(): Promise<void> {
		this.initialization ??= this.initializeOnce().catch((error) => {
			this.initialization = undefined;
			throw error;
		});
		return this.initialization;
	}
	private async initializeOnce(): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN");
			await client.query(
				"SELECT pg_advisory_xact_lock(hashtext('hobo-ci-app-registration-v1'))",
			);
			await client.query(
				"CREATE TABLE IF NOT EXISTS hobo_ci_app_states (digest text PRIMARY KEY, purpose text NOT NULL, account_id text NOT NULL, subject text NOT NULL, expires_ms bigint NOT NULL)",
			);
			await client.query(
				"CREATE TABLE IF NOT EXISTS hobo_ci_app_credentials (app_id bigint PRIMARY KEY, ciphertext bytea NOT NULL)",
			);
			await client.query(
				"CREATE TABLE IF NOT EXISTS hobo_ci_app_installations (installation_id bigint PRIMARY KEY, app_id bigint NOT NULL, account_id text NOT NULL)",
			);
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	}
	async issue(
		digest: string,
		purpose: "register" | "install",
		actor: { accountId: string; subject: string },
		expiresAt: number,
	): Promise<void> {
		Digest.parse(digest);
		Account.parse(actor.accountId);
		z.string().min(1).max(200).parse(actor.subject);
		if (!Number.isSafeInteger(expiresAt) || expiresAt < 0)
			throw new Error("invalid state expiry");
		await this.initialize();
		await this.pool.query(
			"INSERT INTO hobo_ci_app_states (digest, purpose, account_id, subject, expires_ms) VALUES ($1,$2,$3,$4,$5)",
			[digest, purpose, actor.accountId, actor.subject, expiresAt],
		);
	}
	async consume(
		digest: string,
		purpose: "register" | "install",
		actor: { accountId: string; subject: string },
		now: number,
	): Promise<boolean> {
		Digest.parse(digest);
		Account.parse(actor.accountId);
		z.string().min(1).max(200).parse(actor.subject);
		if (!Number.isSafeInteger(now) || now < 0) throw new Error("invalid clock");
		await this.initialize();
		const result = await this.pool.query(
			"DELETE FROM hobo_ci_app_states WHERE digest=$1 AND purpose=$2 AND account_id=$3 AND subject=$4 AND expires_ms>$5 RETURNING digest",
			[digest, purpose, actor.accountId, actor.subject, now],
		);
		return result.rowCount === 1;
	}
	private seal(appId: number, plaintext: Buffer): Buffer {
		const nonce = randomBytes(12);
		const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
		cipher.setAAD(Buffer.from(`hobo-ci-app:v1:${appId}`));
		const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
		return Buffer.concat([
			Buffer.from([1]),
			nonce,
			cipher.getAuthTag(),
			encrypted,
		]);
	}
	private open(appId: number, value: Buffer): Buffer {
		if (value.length < 30 || value[0] !== 1)
			throw new Error("invalid encrypted App credentials");
		try {
			const cipher = createDecipheriv(
				"aes-256-gcm",
				this.key,
				value.subarray(1, 13),
			);
			cipher.setAAD(Buffer.from(`hobo-ci-app:v1:${appId}`));
			cipher.setAuthTag(value.subarray(13, 29));
			return Buffer.concat([cipher.update(value.subarray(29)), cipher.final()]);
		} catch {
			throw new Error("unable to decrypt App credentials");
		}
	}
	async saveApp(
		appId: number,
		credentials: z.input<typeof Credentials>,
	): Promise<void> {
		Id.parse(appId);
		const plaintext = Buffer.from(
			JSON.stringify(Credentials.parse(credentials)),
		);
		await this.initialize();
		const inserted = await this.pool.query(
			"INSERT INTO hobo_ci_app_credentials (app_id, ciphertext) VALUES ($1,$2) ON CONFLICT (app_id) DO NOTHING RETURNING app_id",
			[appId, this.seal(appId, plaintext)],
		);
		if (inserted.rowCount === 1) return;
		const existing = await this.pool.query(
			"SELECT ciphertext FROM hobo_ci_app_credentials WHERE app_id=$1",
			[appId],
		);
		const record = Envelope.parse(existing.rows[0]);
		const original = this.open(appId, record.ciphertext);
		if (
			original.byteLength !== plaintext.byteLength ||
			!timingSafeEqual(original, plaintext)
		)
			throw new Error("App credentials already exist");
	}
	/** Expose secrets only to the trusted GitHub transport composition, never HTTP. */
	async loadApp(
		appId: number,
	): Promise<z.infer<typeof Credentials> | undefined> {
		Id.parse(appId);
		await this.initialize();
		const result = await this.pool.query(
			"SELECT ciphertext FROM hobo_ci_app_credentials WHERE app_id=$1",
			[appId],
		);
		if (result.rowCount === 0) return undefined;
		return Credentials.parse(
			JSON.parse(
				this.open(appId, Envelope.parse(result.rows[0]).ciphertext).toString(
					"utf8",
				),
			),
		);
	}
	async bindInstallation(
		appId: number,
		installationId: number,
		accountId: string,
	): Promise<void> {
		Id.parse(appId);
		Id.parse(installationId);
		Account.parse(accountId);
		await this.initialize();
		const result = await this.pool.query(
			"INSERT INTO hobo_ci_app_installations (installation_id, app_id, account_id) VALUES ($1,$2,$3) ON CONFLICT (installation_id) DO UPDATE SET account_id=EXCLUDED.account_id WHERE hobo_ci_app_installations.app_id=EXCLUDED.app_id AND hobo_ci_app_installations.account_id=EXCLUDED.account_id RETURNING installation_id",
			[installationId, appId, accountId],
		);
		if (result.rowCount !== 1)
			throw new Error("installation already bound to another account or App");
	}
	async installationOwner(
		appId: number,
		installationId: number,
	): Promise<string | undefined> {
		Id.parse(appId);
		Id.parse(installationId);
		await this.initialize();
		const result = await this.pool.query(
			"SELECT account_id FROM hobo_ci_app_installations WHERE app_id=$1 AND installation_id=$2",
			[appId, installationId],
		);
		return result.rowCount === 0
			? undefined
			: Owner.parse(result.rows[0]).account_id;
	}
	/** Installation ownership is assigned only after GitHub-admin verification. */
	async ownedInstallations(
		appId: number,
		accountId: string,
	): Promise<number[]> {
		Id.parse(appId);
		Account.parse(accountId);
		await this.initialize();
		const result = await this.pool.query(
			"SELECT installation_id FROM hobo_ci_app_installations WHERE app_id=$1 AND account_id=$2 ORDER BY installation_id",
			[appId, accountId],
		);
		return result.rows.map((row) =>
			z.coerce
				.number()
				.int()
				.positive()
				.max(Number.MAX_SAFE_INTEGER)
				.parse(row.installation_id),
		);
	}
}
