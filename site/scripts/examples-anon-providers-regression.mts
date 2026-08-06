/**
 * Live regression: every non-Cloudflare Examples yard provisions a real HTTP
 * same-origin anon Environment Station (+ OpenSaaS ship) via /api/anon.
 * No blob:. No mock greenwash.
 *
 * Run: HOBO_OPENSAAS_SKIP_BUILD=1 EXAMPLES_BASE_URL=… pnpm --filter hobo-site run examples:regression:anon
 */
import { chromium, type Page } from "playwright";

const BASE = (
	process.env.EXAMPLES_BASE_URL ?? "http://127.0.0.1:4321/HoBo/"
).replace(/\/?$/u, "/");

const PROVIDERS = [
	"railway",
	"netlify",
	"vercel",
	"webernetes",
	"lakebed",
	"kubernetes",
	"browser-wasm",
] as const;

function log(msg: string) {
	console.log(`[feature:anon-providers] ${msg}`);
}

async function assertApis(page: Page) {
	const health = await page.request.get(new URL("api/anon/", BASE).toString());
	if (!health.ok()) {
		throw new Error(
			`anon API down (${health.status()}). Start: pnpm --filter hobo-site run dev`,
		);
	}
	const body = (await health.json()) as { ok?: boolean; providers?: string[] };
	if (!body.ok || !Array.isArray(body.providers)) {
		throw new Error(`Unexpected anon health: ${JSON.stringify(body)}`);
	}
	for (const id of PROVIDERS) {
		if (!body.providers.includes(id)) {
			throw new Error(`anon health missing provider ${id}`);
		}
	}
	log(`✓ same-origin anon API · ${body.providers.join(",")}`);
}

async function provisionStation(page: Page, providerId: string) {
	const res = await page.request.post(
		new URL(`api/anon/${providerId}/station`, BASE).toString(),
		{
			data: { stationId: `station:regression:${providerId}` },
			timeout: 60_000,
		},
	);
	const body = (await res.json()) as {
		ok?: boolean;
		error?: string;
		stationUrl?: string;
		endpointUrl?: string;
		claimUrl?: string;
		hostKind?: string;
	};
	if (!res.ok() || !body.ok) {
		throw new Error(
			`${providerId} station failed: ${body.error ?? res.status()}`,
		);
	}
	const url = body.stationUrl ?? body.endpointUrl ?? "";
	if (!url.startsWith("http") || url.startsWith("blob:")) {
		throw new Error(`${providerId} returned bad stationUrl: ${url}`);
	}
	if (!url.includes("/api/anon/host/")) {
		throw new Error(`${providerId} stationUrl not same-origin host: ${url}`);
	}
	const get = await page.request.get(url);
	if (!get.ok()) {
		throw new Error(`${providerId} host GET ${get.status()} for ${url}`);
	}
	const html = await get.text();
	if (!/data-hobo-station/i.test(html)) {
		throw new Error(`${providerId} host missing data-hobo-station`);
	}
	log(`✓ ${providerId} station · ${url}`);
	return url;
}

async function shipOpenSaas(page: Page, providerId: string) {
	const res = await page.request.post(
		new URL(`api/anon/${providerId}/opensaas`, BASE).toString(),
		{
			data: { stationId: `station:regression:${providerId}:opensaas` },
			timeout: 180_000,
		},
	);
	const body = (await res.json()) as {
		ok?: boolean;
		error?: string;
		clientUrl?: string;
		claimUrl?: string;
		hostKind?: string;
	};
	if (!res.ok() || !body.ok || !body.clientUrl) {
		throw new Error(
			`${providerId} opensaas failed: ${body.error ?? res.status()}`,
		);
	}
	if (body.clientUrl.startsWith("blob:")) {
		throw new Error(`${providerId} opensaas returned blob:`);
	}
	const get = await page.request.get(body.clientUrl);
	if (!get.ok()) {
		throw new Error(
			`${providerId} OpenSaaS GET ${get.status()} for ${body.clientUrl}`,
		);
	}
	const html = await get.text();
	if (html.length < 100) {
		throw new Error(`${providerId} OpenSaaS host too small`);
	}
	log(`✓ ${providerId} OpenSaaS · ${body.clientUrl}`);
	return body.clientUrl;
}

async function uiSmokeRailway(page: Page) {
	const url = new URL(`${BASE}examples/`);
	url.searchParams.set("feature", "anon-providers");
	url.searchParams.set("t", String(Date.now()));
	await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 60_000 });
	await page.evaluate(() => localStorage.clear());
	await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 60_000 });
	await page.selectOption("[data-yard-select]", ["railway"]);
	await page.click("[data-deploy-stations]");
	await page.waitForFunction(
		() => {
			const state = document.querySelector("[data-deploy-state]")?.textContent;
			return state === "stations-ready" || state === "failed";
		},
		null,
		{ timeout: 120_000 },
	);
	const snap = await page.evaluate(() => ({
		state: document.querySelector("[data-deploy-state]")?.textContent ?? "",
		terminal: document.querySelector("[data-terminal]")?.textContent ?? "",
	}));
	if (snap.state !== "stations-ready") {
		throw new Error(`Railway UI station deploy failed:\n${snap.terminal}`);
	}
	if (/blob:/i.test(snap.terminal)) {
		throw new Error("Railway UI used blob: — refusing");
	}
	if (!/same-origin agent/i.test(snap.terminal)) {
		throw new Error(`expected same-origin agent in terminal:\n${snap.terminal}`);
	}
	log("✓ Railway UI Deploy stations → same-origin agent");
}

async function main() {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	try {
		await assertApis(page);
		for (const providerId of PROVIDERS) {
			await provisionStation(page, providerId);
			await shipOpenSaas(page, providerId);
		}
		await uiSmokeRailway(page);
		log("PASS all anon providers");
	} finally {
		await browser.close();
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
