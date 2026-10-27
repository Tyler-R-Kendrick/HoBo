import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import pg from "pg";
import {
	createHostedAppBootstrap,
	PostgresAppBootstrapStore,
} from "../src/hosted-app-bootstrap.js";

const url = process.env.HOBO_CI_TEST_POSTGRES;
if (!url) throw new Error("a disposable PostgreSQL database is required");
const pool = new pg.Pool({ connectionString: url });
async function waitForBlockedTransaction() {
	for (let i = 0; i < 200; i++) {
		const result = await pool.query(
			"SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()",
		);
		if (result.rows[0].n > 0) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error("test transaction did not block on lock");
}
let clock = 1_000_000;
const owner = 145080887;
const { privateKey } = generateKeyPairSync("rsa", {
	modulusLength: 2048,
	privateKeyEncoding: { type: "pkcs1", format: "pem" },
	publicKeyEncoding: { type: "spki", format: "pem" },
});
const metadata = (id: number, ownerId: number) => ({
	id,
	slug: `hobo-ci-${id}`,
	owner: { id: ownerId, type: "User" },
	external_url: "https://ci.example.com",
	permissions: {
		actions: "write",
		administration: "write",
		contents: "write",
		workflows: "write",
		metadata: "read",
		pull_requests: "write",
		members: "read",
	},
	events: ["workflow_job", "workflow_run"],
});
const calls: string[] = [];
const makeBootstrap = (invitation: string) =>
	createHostedAppBootstrap({
		pool,
		key: Buffer.alloc(32, 9),
		publicOrigin: "https://ci.example.com",
		accountId: "hobo",
		expectedGithubOwnerId: owner,
		ownerInvitationSha256: createHash("sha256")
			.update(invitation)
			.digest("hex"),
		ownerInvitationExpiresAt: 100_000_000,
		now: () => clock,
		fetch: async (url, init) => {
			if (String(url) === "https://api.github.com/app") {
				const jwt = new Headers(init?.headers)
					.get("authorization")
					?.slice(7)
					.split(".")[1];
				assert.ok(jwt);
				return Response.json(
					metadata(
						Number(JSON.parse(Buffer.from(jwt, "base64url").toString()).iss),
						owner,
					),
				);
			}
			if (String(url) === "https://api.github.com/app/hook/config")
				return Response.json({
					url: "https://ci.example.com/github/webhooks",
					content_type: "json",
					insecure_ssl: "0",
				});
			if (String(url) === "https://github.com/login/oauth/access_token") {
				const data = JSON.parse(String(init?.body));
				assert.ok(
					[
						"https://ci.example.com/v1/app-bootstrap/verify-callback",
						"https://ci.example.com/v1/app-bootstrap/reauth-callback",
					].includes(data.redirect_uri),
				);
				assert.match(data.code_verifier, /^[A-Za-z0-9_-]{43}$/);
				return Response.json({ access_token: data.code, token_type: "bearer" });
			}
			if (String(url) === "https://api.github.com/user") {
				const authorization = new Headers(init?.headers).get("authorization");
				return Response.json({
					id: authorization === "Bearer attacker-oauth" ? 123 : owner,
				});
			}
			const code = String(url).split("/").at(-2);
			calls.push(code ?? "");
			if (code === "uncertain") throw new Error("simulated transport loss");
			const id =
				code === "other"
					? 101
					: code === "duplicate"
						? 103
						: code === "phished"
							? 104
							: 102;
			return Response.json({
				...metadata(id, code === "other" ? 123 : owner),
				pem: privateKey,
				webhook_secret: "webhook-for-disposable-contract",
				client_id: "client-for-disposable-contract",
				client_secret: "secret-for-disposable-contract",
			});
		},
	});
let invitationCounter = 0;
let bootstrap = makeBootstrap(Buffer.alloc(32, 0).toString("base64url"));
async function start() {
	const invitation = Buffer.alloc(32, ++invitationCounter).toString(
		"base64url",
	);
	bootstrap = makeBootstrap(invitation);
	const pages = await Promise.all([
		bootstrap.handle(
			new Request("https://ci.example.com/v1/app-bootstrap/setup"),
		),
		bootstrap.handle(
			new Request("https://ci.example.com/v1/app-bootstrap/setup"),
		),
	]);
	const cookies = pages.map(
		(page) => page?.headers.get("set-cookie")?.split(";")[0],
	);
	assert.ok(cookies[0]);
	assert.ok(cookies[1]);
	const request = (cookie: string, token = invitation) => {
		const headers = new Headers({
			"content-type": "application/json",
			origin: "https://ci.example.com",
			cookie,
		});
		if (token) headers.set("authorization", `Bearer ${token}`);
		return new Request("https://ci.example.com/v1/app-bootstrap/start", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "HoBo CI" }),
		});
	};
	const attempts = await Promise.all([
		bootstrap.handle(request(cookies[0])),
		bootstrap.handle(request(cookies[1])),
	]);
	assert.deepEqual(
		attempts.map((attempt) => attempt?.status).sort(),
		[200, 403],
	);
	const response = attempts.find((attempt) => attempt?.status === 200);
	assert.ok(response);
	const winningCookie = response.headers.get("set-cookie")?.split(";")[0];
	assert.ok(winningCookie);
	const refreshed = await bootstrap.handle(
		new Request("https://ci.example.com/v1/app-bootstrap/setup", {
			headers: { cookie: winningCookie },
		}),
	);
	assert.equal(refreshed?.headers.get("set-cookie"), null);
	const resumed = await bootstrap.handle(request(winningCookie, ""));
	assert.equal(resumed?.status, 200);
	const body = await response.json();
	const state = new URL(body.action).searchParams.get("state");
	const cookie = response.headers.get("set-cookie")?.split(";")[0];
	assert.ok(state);
	assert.ok(cookie);
	return { state, cookie, instance: bootstrap };
}
function callback(
	session: {
		state: string;
		cookie: string;
		instance: ReturnType<typeof makeBootstrap>;
	},
	code: string,
) {
	return session.instance.handle(
		new Request(
			`https://ci.example.com/v1/app-bootstrap/callback?state=${session.state}&code=${code}`,
			{
				headers: { cookie: session.cookie },
			},
		),
	);
}
async function reauthStart() {
	const response = await bootstrap.handle(
		new Request("https://ci.example.com/v1/app-bootstrap/reauth/start", {
			method: "POST",
			headers: {
				origin: "https://ci.example.com",
				"content-type": "application/json",
			},
			body: "{}",
		}),
	);
	assert.equal(response?.status, 200);
	const body = await response.json(),
		target = new URL(body.authorizeUrl);
	assert.equal(target.origin, "https://github.com");
	assert.equal(target.pathname, "/login/oauth/authorize");
	assert.equal(target.searchParams.get("code_challenge_method"), "S256");
	const state = target.searchParams.get("state"),
		cookie = response.headers.get("set-cookie")?.split(";")[0];
	assert.ok(state);
	assert.ok(cookie);
	return { state, cookie };
}
function reauthCallback(
	session: { state: string; cookie: string },
	code: string,
) {
	return bootstrap.handle(
		new Request(
			`https://ci.example.com/v1/app-bootstrap/reauth-callback?state=${session.state}&code=${code}`,
			{ headers: { cookie: session.cookie } },
		),
	);
}
async function verify(
	session: { cookie: string },
	startResponse: Response | undefined,
	code: string,
) {
	assert.equal(startResponse?.status, 303);
	const target = new URL(startResponse.headers.get("location") ?? "");
	assert.equal(target.origin, "https://github.com");
	assert.equal(target.pathname, "/login/oauth/authorize");
	assert.equal(target.searchParams.get("code_challenge_method"), "S256");
	const state = target.searchParams.get("state");
	assert.ok(state);
	return bootstrap.handle(
		new Request(
			`https://ci.example.com/v1/app-bootstrap/verify-callback?state=${state}&code=${code}`,
			{ headers: { cookie: session.cookie } },
		),
	);
}
try {
	const fenceStore = new PostgresAppBootstrapStore(pool);
	await fenceStore.initialize();
	const inviteA = createHash("sha256").update("invite-a").digest("hex");
	const inviteB = createHash("sha256").update("invite-b").digest("hex");
	const inviteSession = createHash("sha256")
		.update("invite-session")
		.digest("hex");
	const inviteOther = createHash("sha256").update("invite-other").digest("hex");
	assert.equal(
		await fenceStore.bindInvitation(
			inviteA,
			inviteSession,
			clock + 1000,
			clock + 1000,
			() => clock,
			true,
		),
		true,
	);
	assert.equal(
		await fenceStore.bindInvitation(
			inviteB,
			inviteSession,
			clock + 1000,
			clock + 1000,
			() => clock,
			true,
		),
		true,
	);
	assert.equal(
		await fenceStore.bindInvitation(
			inviteA,
			inviteOther,
			clock + 1000,
			clock + 1000,
			() => clock,
			true,
		),
		false,
	);
	const expiringInvite = createHash("sha256")
		.update("expiring-invite")
		.digest("hex");
	const lockForInvite = await pool.connect();
	await lockForInvite.query("BEGIN");
	await lockForInvite.query(
		"SELECT pg_advisory_xact_lock(hashtext('hobo-ci-platform-app-attempts-v1'))",
	);
	const delayedInvite = fenceStore.bindInvitation(
		expiringInvite,
		inviteOther,
		clock + 1000,
		clock + 1,
		() => clock,
		true,
	);
	await waitForBlockedTransaction();
	clock += 2;
	await lockForInvite.query("COMMIT");
	lockForInvite.release();
	assert.equal(await delayedInvite, false);
	const resumeSession = createHash("sha256")
		.update("resume-session")
		.digest("hex");
	const resumeInvite = createHash("sha256")
		.update("resume-invite")
		.digest("hex");
	assert.equal(
		await fenceStore.bindInvitation(
			resumeInvite,
			resumeSession,
			clock + 1,
			clock + 1000,
			() => clock,
			true,
		),
		true,
	);
	const lockForResume = await pool.connect();
	await lockForResume.query("BEGIN");
	await lockForResume.query(
		"SELECT pg_advisory_xact_lock(hashtext('hobo-ci-platform-app-attempts-v1'))",
	);
	const delayedResume = fenceStore.bindInvitation(
		resumeInvite,
		resumeSession,
		clock + 1000,
		clock + 1000,
		() => clock,
		false,
	);
	await waitForBlockedTransaction();
	clock += 2;
	await lockForResume.query("COMMIT");
	lockForResume.release();
	assert.equal(await delayedResume, false);
	const staleRegistration = createHash("sha256")
		.update("stale-registration")
		.digest("hex");
	await pool.query(
		"INSERT INTO hobo_ci_platform_app_attempts(session_digest,status,created_ms,expires_ms,app_id,metadata) VALUES ($1,'uncertain',$2,$3,999,$4::jsonb)",
		[
			staleRegistration,
			clock,
			clock + 600_000,
			JSON.stringify(metadata(999, owner)),
		],
	);
	assert.equal(
		await fenceStore.completeVerified(
			staleRegistration,
			999,
			owner,
			metadata(999, owner),
			() => clock,
		),
		false,
	);
	await pool.query(
		"UPDATE hobo_ci_platform_app_attempts SET status='verifying',expires_ms=$2 WHERE session_digest=$1",
		[staleRegistration, clock + 1],
	);
	const lockClient = await pool.connect();
	await lockClient.query("BEGIN");
	await lockClient.query(
		"SELECT pg_advisory_xact_lock(hashtext('hobo-ci-platform-app-v1'))",
	);
	const delayed = fenceStore.completeVerified(
		staleRegistration,
		999,
		owner,
		metadata(999, owner),
		() => clock,
	);
	await waitForBlockedTransaction();
	clock += 2;
	await lockClient.query("COMMIT");
	lockClient.release();
	assert.equal(await delayed, false);
	await pool.query(
		"UPDATE hobo_ci_platform_app_attempts SET status='verifying',expires_ms=$2 WHERE session_digest=$1",
		[staleRegistration, clock + 1],
	);
	const rowLockClient = await pool.connect();
	await rowLockClient.query("BEGIN");
	await rowLockClient.query(
		"SELECT 1 FROM hobo_ci_platform_app_attempts WHERE session_digest=$1 FOR UPDATE",
		[staleRegistration],
	);
	const rowDelayed = fenceStore.completeVerified(
		staleRegistration,
		999,
		owner,
		metadata(999, owner),
		() => clock,
	);
	await waitForBlockedTransaction();
	clock += 2;
	await rowLockClient.query("COMMIT");
	rowLockClient.release();
	assert.equal(await rowDelayed, false);
	await pool.query(
		"DELETE FROM hobo_ci_platform_app_attempts WHERE session_digest=$1",
		[staleRegistration],
	);
	const attacker = await start();
	const ownerSession = await start();
	const revoked = await bootstrap.handle(
		new Request("https://ci.example.com/v1/app-bootstrap/start", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "https://ci.example.com",
				cookie: attacker.cookie,
			},
			body: JSON.stringify({ name: "HoBo CI" }),
		}),
	);
	assert.equal(revoked?.status, 403);
	assert.equal((await callback(attacker, "other"))?.status, 403);
	const afterConversion = await attacker.instance.handle(
		new Request("https://ci.example.com/v1/app-bootstrap/start", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "https://ci.example.com",
				cookie: attacker.cookie,
			},
			body: JSON.stringify({ name: "HoBo CI" }),
		}),
	);
	assert.equal(afterConversion?.status, 403);
	assert.equal(
		(
			await pool.query(
				"SELECT count(*)::int AS count FROM hobo_ci_platform_app",
			)
		).rows[0].count,
		0,
	);
	// An App owned by the right GitHub account is insufficient if the browser
	// belongs to an attacker who obtained the manifest conversion code.
	const phished = await start();
	const stagedAttacker = await callback(phished, "phished");
	assert.equal(
		await bootstrap.isVerifiedOwner(
			new Request("https://ci.example.com/", {
				headers: { cookie: phished.cookie },
			}),
		),
		false,
	);
	assert.equal(
		(await verify(phished, stagedAttacker, "attacker-oauth"))?.status,
		403,
	);
	assert.equal(
		(
			await pool.query(
				"SELECT count(*)::int AS count FROM hobo_ci_platform_app",
			)
		).rows[0].count,
		0,
	);
	const duplicate = await start();
	const stagedDuplicate = await callback(duplicate, "duplicate");
	const stagedOwner = await callback(ownerSession, "owner");
	const uncertain = await start();
	assert.equal((await callback(uncertain, "uncertain"))?.status, 409);
	assert.equal((await callback(uncertain, "uncertain"))?.status, 403);
	assert.equal(
		await bootstrap.isVerifiedOwner(
			new Request("https://ci.example.com/", {
				headers: { cookie: ownerSession.cookie },
			}),
		),
		false,
	);
	assert.equal(
		(await verify(ownerSession, stagedOwner, "owner-oauth"))?.status,
		303,
	);
	assert.equal(
		await bootstrap.isVerifiedOwner(
			new Request("https://ci.example.com/", {
				headers: { cookie: ownerSession.cookie },
			}),
		),
		true,
	);
	assert.equal(
		await bootstrap.isVerifiedOwner(
			new Request("https://ci.example.com/", {
				headers: { cookie: attacker.cookie },
			}),
		),
		false,
	);
	const changedOwner = createHostedAppBootstrap({
		pool,
		key: Buffer.alloc(32, 9),
		publicOrigin: "https://ci.example.com",
		accountId: "hobo",
		expectedGithubOwnerId: owner + 1,
		ownerInvitationSha256: createHash("sha256")
			.update(Buffer.alloc(32, invitationCounter).toString("base64url"))
			.digest("hex"),
		ownerInvitationExpiresAt: 100_000_000,
		now: () => clock,
	});
	assert.equal(
		await changedOwner.isVerifiedOwner(
			new Request("https://ci.example.com/", {
				headers: { cookie: ownerSession.cookie },
			}),
		),
		false,
	);
	assert.equal((await callback(ownerSession, "owner"))?.status, 403);
	assert.deepEqual(calls, [
		"other",
		"phished",
		"duplicate",
		"owner",
		"uncertain",
	]);
	assert.equal(
		(await verify(duplicate, stagedDuplicate, "owner-oauth"))?.status,
		409,
	);
	const records = await pool.query(
		"SELECT app_id,ciphertext FROM hobo_ci_app_credentials ORDER BY app_id",
	);
	assert.deepEqual(
		records.rows.map((row) => Number(row.app_id)),
		[102, 103, 104],
	);
	for (const row of records.rows)
		assert.equal(row.ciphertext.includes(Buffer.from(privateKey)), false);
	assert.equal(await bootstrap.load().then((entry) => entry?.appId), 102);
	clock += 600_001;
	assert.equal(
		await bootstrap.isVerifiedOwner(
			new Request("https://ci.example.com/", {
				headers: { cookie: ownerSession.cookie },
			}),
		),
		false,
	);
	const setup = await bootstrap.handle(
		new Request("https://ci.example.com/v1/app-bootstrap/setup"),
	);
	assert.match(await setup.text(), /Reconnect GitHub/);
	const forbiddenCreate = await bootstrap.handle(
		new Request("https://ci.example.com/v1/app-bootstrap/start", {
			method: "POST",
			headers: {
				origin: "https://ci.example.com",
				"content-type": "application/json",
				authorization: `Bearer ${Buffer.alloc(32, invitationCounter).toString("base64url")}`,
			},
			body: JSON.stringify({ name: "HoBo CI" }),
		}),
	);
	assert.equal(forbiddenCreate?.status, 409);
	const untrustedOrigin = await bootstrap.handle(
		new Request("https://ci.example.com/v1/app-bootstrap/reauth/start", {
			method: "POST",
			headers: { origin: "https://attacker.example" },
		}),
	);
	assert.equal(untrustedOrigin?.status, 403);
	const wrongReauth = await reauthStart();
	assert.equal(
		(await reauthCallback(wrongReauth, "attacker-oauth"))?.status,
		403,
	);
	assert.equal(
		await bootstrap.isVerifiedOwner(
			new Request("https://ci.example.com/", {
				headers: { cookie: wrongReauth.cookie },
			}),
		),
		false,
	);
	const ownerReauth = await reauthStart();
	assert.equal(
		(
			await reauthCallback(
				{ state: ownerReauth.state, cookie: wrongReauth.cookie },
				"owner-oauth",
			)
		)?.status,
		403,
	);
	assert.equal((await reauthCallback(ownerReauth, "owner-oauth"))?.status, 303);
	assert.equal((await reauthCallback(ownerReauth, "owner-oauth"))?.status, 403);
	const staleReauth = createHash("sha256").update("stale-reauth").digest("hex");
	await pool.query(
		"INSERT INTO hobo_ci_platform_app_attempts(session_digest,status,created_ms,expires_ms,app_id) VALUES ($1,'reauth_uncertain',$2,$3,102)",
		[staleReauth, clock, clock + 600_000],
	);
	assert.equal(
		await fenceStore.refreshOwner(staleReauth, 102, owner, () => clock),
		false,
	);
	await pool.query(
		"UPDATE hobo_ci_platform_app_attempts SET status='reauth_verifying',created_ms=$2 WHERE session_digest=$1",
		[staleReauth, clock - 1],
	);
	assert.equal(
		await fenceStore.refreshOwner(staleReauth, 102, owner, () => clock),
		false,
	);
	await pool.query(
		"DELETE FROM hobo_ci_platform_app_attempts WHERE session_digest=$1",
		[staleReauth],
	);
	assert.equal(
		await bootstrap.isVerifiedOwner(
			new Request("https://ci.example.com/", {
				headers: { cookie: ownerReauth.cookie },
			}),
		),
		true,
	);
	assert.equal(await bootstrap.load().then((entry) => entry?.appId), 102);
	clock += 60_001;
	const storedMetadata = await pool.query(
		"SELECT metadata::text AS metadata FROM hobo_ci_platform_app_attempts WHERE app_id=103",
	);
	assert.equal(
		storedMetadata.rows[0].metadata.includes("secret-for-disposable-contract"),
		false,
	);
	assert.equal(storedMetadata.rows[0].metadata.includes("PRIVATE KEY"), false);
	// Wrong-user OAuth never loses the one-time GitHub App private key.
	assert.equal(
		(
			await pool.query(
				"SELECT count(*)::int AS count FROM hobo_ci_app_credentials WHERE app_id=104",
			)
		).rows[0].count,
		1,
	);
	// Anonymous starts do not reserve a singleton; callbacks have a shared,
	// transactional limit that expires so the legitimate owner can retry.
	const store = new PostgresAppBootstrapStore(pool);
	const flood = Array.from({ length: 6 }, (_, i) =>
		createHash("sha256").update(`flood:${i}`).digest("hex"),
	);
	const sixth = flood[5];
	assert.ok(sixth);
	for (const digest of flood.slice(0, 5))
		assert.equal(
			await store.claimAttempt(digest, clock + 600_000, clock),
			"claimed",
		);
	assert.equal(
		await store.claimAttempt(sixth, clock + 600_000, clock),
		"limited",
	);
	const separateReauth = createHash("sha256")
		.update("separate-reauth")
		.digest("hex");
	assert.equal(
		await store.claimAttempt(separateReauth, clock + 600_000, clock, true),
		"claimed",
	);
	await pool.query(
		"DELETE FROM hobo_ci_platform_app_attempts WHERE session_digest=$1",
		[separateReauth],
	);
	clock += 60_001;
	assert.equal(
		await store.claimAttempt(sixth, clock + 600_000, clock),
		"claimed",
	);
	await pool.query(
		"DELETE FROM hobo_ci_platform_app_attempts WHERE session_digest=ANY($1::text[])",
		[flood],
	);
	assert.equal(
		(
			await pool.query(
				"SELECT count(*)::int AS count FROM hobo_ci_platform_app_attempts WHERE status='uncertain' AND app_id IS NULL",
			)
		).rows[0].count,
		1,
	);
	// A bounded set of unresolved owned Apps remains available for operator
	// reconciliation; it does not grow without limit or delete active credentials.
	await pool.query(
		"INSERT INTO hobo_ci_platform_app_attempts(session_digest,status,created_ms,expires_ms,app_id) SELECT lpad(to_hex(i),64,'0'),'uncertain',$1,$2,200+i FROM generate_series(1,18) AS i",
		[clock - 120_000, clock - 1],
	);
	const capped = createHash("sha256").update("capped").digest("hex");
	assert.equal(
		await store.claimAttempt(capped, clock + 600_000, clock),
		"limited",
	);
	assert.equal(
		(
			await pool.query(
				"SELECT count(*)::int AS count FROM hobo_ci_platform_app_attempts WHERE status IN ('uncertain','rejected') AND app_id IS NOT NULL",
			)
		).rows[0].count,
		20,
	);
	await pool.query(
		"DELETE FROM hobo_ci_platform_app_attempts WHERE app_id BETWEEN 201 AND 218",
	);
	assert.equal(
		await store.claimAttempt(capped, clock + 600_000, clock),
		"claimed",
	);
	clock += 24 * 60 * 60_000;
	assert.equal(
		await store.claimAttempt(
			createHash("sha256").update("after-prune").digest("hex"),
			clock + 600_000,
			clock,
		),
		"claimed",
	);
	assert.equal(
		(
			await pool.query(
				"SELECT count(*)::int AS count FROM hobo_ci_platform_app_attempts WHERE status='uncertain' AND app_id IS NULL",
			)
		).rows[0].count,
		0,
	);
	assert.equal(
		(
			await pool.query(
				"SELECT count(*)::int AS count FROM hobo_ci_app_credentials WHERE app_id IN (102,103)",
			)
		).rows[0].count,
		2,
	);
	process.stdout.write("owner-pinned public bootstrap contract passed\n");
} finally {
	await pool.end();
}
