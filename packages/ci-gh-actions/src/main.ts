import { readFileSync } from "node:fs";
import { parseConfiguration } from "@hobo/ci";
import { createGithubAppTransport } from "./github.js";
import { createGithubOidcVerifier } from "./oidc.js";
import { Relay } from "./relay.js";
import { createRelayServer } from "./server.js";
import { LeaseStore } from "./store.js";

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`missing configuration: ${name}`);
	return value;
}

const config = parseConfiguration(
	readFileSync(required("HOBO_CI_CONFIG"), "utf8"),
);
const publicUrl = new URL(required("HOBO_CI_PUBLIC_URL"));
if (
	publicUrl.protocol !== "https:" ||
	publicUrl.username ||
	publicUrl.password ||
	publicUrl.pathname !== "/" ||
	publicUrl.search ||
	publicUrl.hash
)
	throw new Error("relay public URL must be an HTTPS origin");
const store = new LeaseStore(required("HOBO_CI_DB"));
const relay = new Relay({
	config,
	store,
	github: createGithubAppTransport({
		appId: required("HOBO_CI_GITHUB_APP_ID"),
		privateKey: readFileSync(required("HOBO_CI_GITHUB_APP_KEY_FILE"), "utf8"),
	}),
	identity: createGithubOidcVerifier(publicUrl.origin),
	webhookSecret: required("HOBO_CI_WEBHOOK_SECRET"),
});
store.recover(relay.now());
const server = createRelayServer(relay);
const port = Number(process.env.HOBO_CI_PORT ?? "8787");
if (!Number.isInteger(port) || port < 1 || port > 65535)
	throw new Error("invalid relay port");
server.listen(port, process.env.HOBO_CI_HOST ?? "127.0.0.1");
let running: Promise<void> | undefined;
function tick(): void {
	if (running) return;
	running = (async () => {
		for (const lease of store
			.all()
			.filter((lease) =>
				["running", "claiming", "dispatched", "uncertain"].includes(
					lease.state,
				),
			)) {
			try {
				if (lease.hostRunId > 0)
					await relay.reconcile(lease.id, lease.hostRunId);
				else await relay.discover(lease.id);
			} catch {
				/* Still active or unavailable: retain reservation. */
			}
		}
		await relay.dispatchPending();
	})()
		.catch(() => {
			process.stderr.write(
				"HoBo CI worker could not complete a tick; reservations retained.\n",
			);
		})
		.finally(() => {
			running = undefined;
		});
}
const timer = setInterval(tick, 5000);
tick();
async function stop(): Promise<void> {
	clearInterval(timer);
	await new Promise<void>((resolve) => server.close(() => resolve()));
	await running;
	store.close();
}
process.once("SIGTERM", () => {
	void stop();
});
process.once("SIGINT", () => {
	void stop();
});
