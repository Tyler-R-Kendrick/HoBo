import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { expect, it } from "vitest";
import { PostgresAppRegistration } from "../src/app-registration-postgres.js";

function fixture() {
	const states = new Map<
		string,
		{ purpose: string; account: string; subject: string; expires: number }
	>();
	const secrets = new Map<number, Buffer>();
	const owners = new Map<number, { app: number; account: string }>();
	async function query(sql: string, values: unknown[] = []) {
		if (/^(BEGIN|COMMIT|ROLLBACK|SELECT pg_advisory|CREATE TABLE)/.test(sql))
			return { rows: [], rowCount: 0 };
		if (sql.startsWith("INSERT INTO hobo_ci_app_states")) {
			const [id, purpose, account, subject, expires] = values;
			if (states.has(String(id))) throw new Error("duplicate state");
			states.set(String(id), {
				purpose: String(purpose),
				account: String(account),
				subject: String(subject),
				expires: Number(expires),
			});
			return { rows: [], rowCount: 1 };
		}
		if (sql.startsWith("DELETE FROM hobo_ci_app_states")) {
			const [id, purpose, account, subject, now] = values;
			const state = states.get(String(id));
			if (
				!state ||
				state.purpose !== purpose ||
				state.account !== account ||
				state.subject !== subject ||
				state.expires <= Number(now)
			)
				return { rows: [], rowCount: 0 };
			states.delete(String(id));
			return { rows: [{ digest: id }], rowCount: 1 };
		}
		if (sql.startsWith("INSERT INTO hobo_ci_app_credentials")) {
			const id = Number(values[0]);
			if (secrets.has(id)) return { rows: [], rowCount: 0 };
			if (!Buffer.isBuffer(values[1]))
				throw new Error("expected encrypted buffer");
			secrets.set(id, values[1]);
			return { rows: [{ app_id: id }], rowCount: 1 };
		}
		if (sql.startsWith("SELECT ciphertext")) {
			const ciphertext = secrets.get(Number(values[0]));
			return ciphertext
				? { rows: [{ ciphertext }], rowCount: 1 }
				: { rows: [], rowCount: 0 };
		}
		if (sql.startsWith("INSERT INTO hobo_ci_app_installations")) {
			const id = Number(values[0]),
				app = Number(values[1]),
				account = String(values[2]);
			const old = owners.get(id);
			if (old && (old.app !== app || old.account !== account))
				return { rows: [], rowCount: 0 };
			owners.set(id, { app, account });
			return { rows: [{ installation_id: id }], rowCount: 1 };
		}
		if (sql.startsWith("SELECT account_id")) {
			const owner = owners.get(Number(values[1]));
			return owner && owner.app === Number(values[0])
				? { rows: [{ account_id: owner.account }], rowCount: 1 }
				: { rows: [], rowCount: 0 };
		}
		throw new Error(`unexpected SQL: ${sql}`);
	}
	// SAFETY: the fake implements the two Pool operations the adapter uses.
	const pool = {
		query,
		async connect() {
			return { query, release() {} };
		},
	} as Pool;
	const key = randomBytes(32);
	return { app: new PostgresAppRegistration(pool, key), pool, key, secrets };
}

it("consumes an identity-bound state once under concurrent callbacks", async () => {
	const { app } = fixture();
	const digest = createHash("sha256").update("state").digest("hex");
	const actor = { accountId: "alice", subject: "user" };
	await app.issue(digest, "install", actor, 2000);
	expect(
		await app.consume(
			digest,
			"install",
			{ ...actor, subject: "intruder" },
			1000,
		),
	).toBe(false);
	const results = await Promise.all(
		Array.from({ length: 5 }, () =>
			app.consume(digest, "install", actor, 1000),
		),
	);
	expect(results.filter(Boolean)).toHaveLength(1);
});

it("encrypts App credentials and refuses tampering, wrong keys and replacement", async () => {
	const { app, pool, key, secrets } = fixture();
	const credentials = {
		pem: "fixture-private-key",
		webhookSecret: "webhook",
		clientId: "client",
		clientSecret: "secret",
	};
	await app.saveApp(42, credentials);
	await app.saveApp(42, credentials);
	expect(await app.loadApp(42)).toEqual(credentials);
	const ciphertext = secrets.get(42);
	if (!ciphertext) throw new Error("fixture");
	expect(ciphertext.includes(Buffer.from(credentials.pem))).toBe(false);
	await expect(
		app.saveApp(42, { ...credentials, pem: "changed" }),
	).rejects.toThrow(/already exist/);
	await expect(
		new PostgresAppRegistration(pool, randomBytes(32)).loadApp(42),
	).rejects.toThrow(/decrypt/);
	secrets.set(43, ciphertext);
	await expect(
		new PostgresAppRegistration(pool, key).loadApp(43),
	).rejects.toThrow(/decrypt/);
	ciphertext[ciphertext.length - 1] =
		(ciphertext[ciphertext.length - 1] ?? 0) ^ 1;
	await expect(app.loadApp(42)).rejects.toThrow(/decrypt/);
});

it("binds each installation to one App and account", async () => {
	const { app } = fixture();
	await app.bindInstallation(42, 88, "alice");
	await app.bindInstallation(42, 88, "alice");
	await expect(app.bindInstallation(42, 88, "bob")).rejects.toThrow(
		/another account/,
	);
	await expect(app.bindInstallation(43, 88, "alice")).rejects.toThrow(
		/another account/,
	);
	expect(await app.installationOwner(42, 88)).toBe("alice");
});
