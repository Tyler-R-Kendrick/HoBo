import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { createHostedAppBootstrap } from "../src/hosted-app-bootstrap.js";
import { createHostedAppOnboarding } from "../src/hosted-app-onboarding.js";

// Only a fresh disposable test database is allowed; this lane initializes singleton bootstrap state.
const url = process.env.HOBO_CI_TEST_POSTGRES;
if (!url)
	throw new Error(
		"HOBO_CI_TEST_POSTGRES must name a fresh disposable database",
	);
const pool = new Pool({ connectionString: url, max: 12 });
const key = randomBytes(32),
	operator = "x".repeat(40),
	alice = "a".repeat(40),
	bob = "b".repeat(40);
const digest = createHash("sha256").update(operator).digest("hex");
const origin = "https://ci.example.test";
function cookie(response: Response, name: string) {
	const value = response.headers
		.getSetCookie()
		.find((item) => item.startsWith(`${name}=`))
		?.split(";")[0];
	if (!value) throw new Error(`missing ${name} cookie`);
	return value;
}
try {
	const bootOptions = {
		pool,
		key,
		publicOrigin: origin,
		accountId: "platform",
		bootstrapTokenSha256: digest,
		fetch: async (url, init) => {
			assert.match(
				String(url),
				/^https:\/\/api.github.com\/app-manifests\/code1\/conversions$/,
			);
			assert.equal(init?.redirect, "error");
			return Response.json({
				id: 42,
				pem: "PRIVATE APP PEM",
				webhook_secret: "WEBHOOK SECRET",
				client_id: "client123",
				client_secret: "CLIENT SECRET",
			});
		},
	};
	const boot = createHostedAppBootstrap(bootOptions);
	const otherBoot = createHostedAppBootstrap(bootOptions);
	const payload = {
		method: "POST",
		headers: {
			authorization: `Bearer ${operator}`,
			"content-type": "application/json",
			origin,
		},
		body: JSON.stringify({ name: "HoBo CI" }),
	};
	const starts = await Promise.all(
		Array.from({ length: 10 }, (_, index) =>
			(index % 2 ? otherBoot : boot).handle(
				new Request(`${origin}/v1/app-bootstrap/start`, payload),
			),
		),
	);
	assert.equal(starts.filter((r) => r?.status === 200).length, 1);
	const start = starts.find((r) => r?.status === 200);
	if (!start) throw new Error("missing bootstrap start");
	const body = await start.json();
	assert.equal(
		body.manifest.callback_urls[0],
		`${origin}/v1/app-registration/oauth/callback`,
	);
	assert.equal(body.manifest.default_permissions.members, "read");
	const state = new URL(body.action).searchParams.get("state");
	assert.ok(state);
	const session = cookie(start, "__Host-hobo_ci_bootstrap"),
		callback = `${origin}/v1/app-bootstrap/callback?state=${state}&code=code1`;
	assert.equal((await boot.handle(new Request(callback)))?.status, 400);
	const completed = await boot.handle(
		new Request(callback, { headers: { cookie: session } }),
	);
	assert.equal(completed?.status, 200);
	assert.deepEqual(await completed?.json(), { appId: 42 });
	assert.equal(
		(await boot.handle(new Request(callback, { headers: { cookie: session } })))
			?.status,
		403,
	);
	assert.equal((await boot.load())?.clientSecret, "CLIENT SECRET");
	const encrypted = await pool.query(
		"SELECT ciphertext FROM hobo_ci_app_credentials WHERE app_id=42",
	);
	assert.equal(
		Buffer.from(encrypted.rows[0].ciphertext).includes(
			Buffer.from("CLIENT SECRET"),
		),
		false,
	);
	assert.equal(
		(
			await boot.handle(
				new Request(`${origin}/v1/app-bootstrap/start`, payload),
			)
		)?.status,
		409,
	);
	let enabled = true;
	const control = async (auth: string | undefined) =>
		!enabled
			? undefined
			: auth === `Bearer ${alice}`
				? {
						accountId: "alice",
						installationIds: [],
						scopes: ["repositories:write"],
					}
				: auth === `Bearer ${bob}`
					? {
							accountId: "bob",
							installationIds: [],
							scopes: ["repositories:write"],
						}
					: undefined;
	let appIdentity = { id: 42, slug: "hobo-ci" };
	const github = {
		async appRequest(path: string) {
			if (path === "/app") return Response.json(appIdentity);
			assert.equal(path, "/app/installations/88");
			return Response.json({
				id: 88,
				app_id: 42,
				suspended_at: null,
				account: { id: 7, login: "owner", type: "User" },
			});
		},
		async request() {
			throw new Error("unexpected installation request");
		},
	};
	const hosted = createHostedAppOnboarding({
		pool,
		key,
		publicOrigin: origin,
		appId: 42,
		clientId: "client123",
		clientSecret: "CLIENT SECRET",
		github,
		authenticate: control,
		fetch: async (url, init) => {
			assert.equal(init?.redirect, "error");
			if (String(url).endsWith("/access_token"))
				return Response.json({
					access_token: "USER TOKEN",
					token_type: "bearer",
				});
			assert.equal(String(url), "https://api.github.com/user");
			return Response.json({ id: 7 });
		},
	});
	const startOauth = await hosted.handle(
		new Request(`${origin}/v1/app-registration/oauth/start`, {
			method: "POST",
			headers: { authorization: `Bearer ${alice}`, origin },
		}),
	);
	assert.equal(startOauth?.status, 200);
	if (!startOauth) throw new Error("missing OAuth start");
	const oauthBody = await startOauth.json(),
		oauthState = new URL(oauthBody.authorizeUrl).searchParams.get("state");
	assert.ok(oauthState);
	const oauthCookie = cookie(startOauth, "__Host-hobo_ci_oauth");
	const oauthCallback = `${origin}/v1/app-registration/oauth/callback?state=${oauthState}&code=abc`;
	assert.equal((await hosted.handle(new Request(oauthCallback)))?.status, 400);
	const login = await hosted.handle(
		new Request(oauthCallback, { headers: { cookie: oauthCookie } }),
	);
	assert.equal(login?.status, 200);
	if (!login) throw new Error("missing login");
	assert.deepEqual(await login.json(), { status: "authenticated" });
	const sessionCookie = cookie(login, "__Host-hobo_ci_session");
	const sessionRows = await pool.query(
		"SELECT secret FROM hobo_ci_oauth_sessions",
	);
	assert.equal(
		Buffer.from(sessionRows.rows[0].secret).includes(Buffer.from("USER TOKEN")),
		false,
	);
	assert.equal(
		Buffer.from(sessionRows.rows[0].secret).includes(Buffer.from(alice)),
		false,
	);
	const issue = () =>
		hosted.handle(
			new Request(`${origin}/v1/app-registration/state`, {
				method: "POST",
				headers: {
					cookie: sessionCookie,
					"content-type": "application/json",
					origin,
				},
				body: JSON.stringify({ purpose: "install" }),
			}),
		);
	appIdentity = { id: 99, slug: "hobo-ci" };
	assert.equal((await issue())?.status, 503);
	appIdentity = { id: 42, slug: "evil.test" };
	assert.equal((await issue())?.status, 503);
	appIdentity = { id: 42, slug: "hobo-ci" };
	const issueResult = await issue();
	assert.equal(issueResult?.status, 200);
	if (!issueResult) throw new Error("missing registration state");
	const installBody = await issueResult.json();
	const installState = installBody.state;
	const installationUrl = new URL(installBody.installationUrl);
	assert.equal(installationUrl.origin, "https://github.com");
	assert.equal(installationUrl.pathname, "/apps/hobo-ci/installations/new");
	assert.equal(installationUrl.searchParams.get("state"), installState);
	const install = `${origin}/v1/app-registration/install-callback?state=${installState}&installation_id=88&setup_action=install`;
	const result = await hosted.handle(
		new Request(install, { headers: { cookie: sessionCookie } }),
	);
	assert.equal(result?.status, 200);
	assert.deepEqual(
		(await hosted.authenticate(`Bearer ${alice}`))?.installationIds,
		[88],
	);
	assert.deepEqual(
		(await hosted.authenticate(`Bearer ${bob}`))?.installationIds,
		[],
	);
	assert.equal(
		(
			await hosted.handle(
				new Request(install, { headers: { cookie: sessionCookie } }),
			)
		)?.status,
		403,
	);
	assert.equal(
		(
			await hosted.handle(
				new Request(`${origin}/v1/app-registration/state`, {
					method: "POST",
					headers: {
						cookie: sessionCookie,
						"content-type": "application/json",
						origin: "https://evil.test",
					},
					body: JSON.stringify({ purpose: "install" }),
				}),
			)
		)?.status,
		403,
	);
	enabled = false;
	assert.equal((await issue())?.status, 401);
	// Reset only this test's disposable singleton to exercise an ambiguous conversion.
	await pool.query("DELETE FROM hobo_ci_platform_app WHERE singleton=true");
	let current = 1_000_000;
	let conversions = 0;
	const uncertain = createHostedAppBootstrap({
		...bootOptions,
		now: () => current,
		fetch: async () => {
			conversions++;
			throw new Error("response lost");
		},
	});
	const uncertainStart = await uncertain.handle(
		new Request(`${origin}/v1/app-bootstrap/start`, payload),
	);
	assert.equal(uncertainStart?.status, 200);
	if (!uncertainStart) throw new Error("missing uncertain start");
	const uncertainBody = await uncertainStart.json();
	const uncertainState = new URL(uncertainBody.action).searchParams.get(
		"state",
	);
	const uncertainCookie = cookie(uncertainStart, "__Host-hobo_ci_bootstrap");
	const uncertainCallback = `${origin}/v1/app-bootstrap/callback?state=${uncertainState}&code=code1`;
	const uncertainResults = await Promise.all(
		Array.from({ length: 10 }, () =>
			uncertain.handle(
				new Request(uncertainCallback, {
					headers: { cookie: uncertainCookie },
				}),
			),
		),
	);
	assert.equal(
		uncertainResults.filter((result) => result?.status === 409).length,
		1,
	);
	assert.equal(conversions, 1);
	current += 20 * 60_000;
	assert.equal(
		(
			await uncertain.handle(
				new Request(`${origin}/v1/app-bootstrap/start`, payload),
			)
		)?.status,
		409,
	);
	console.log(
		"Disposable PostgreSQL onboarding contract passed: singleton bootstrap, PKCE login, encrypted credentials, CSRF/replay, tenant binding and revocation",
	);
} finally {
	await pool.end();
}
