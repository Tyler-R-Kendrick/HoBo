import { z } from "zod";
import {
	type RuntimeBrokerConfig as BrokerRuntimeConfig,
	RuntimeBrokerConfig,
} from "./neon-secret-broker.js";

/** Only application settings may come from the broker. Database and Vercel
 * credentials remain bound by their respective platform integrations. */
const Envelope = z.object({ config: RuntimeBrokerConfig }).strict();

/** The URL is trusted deployment configuration, not a value from a request. */
export function runtimeBrokerOrigin(value: string): string {
	const url = new URL(value);
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.port ||
		url.pathname !== "/" ||
		url.search ||
		url.hash
	)
		throw new Error("invalid runtime broker origin");
	return url.origin;
}

/** Exchange a request-scoped Vercel identity for the app's secret settings.
 * The token is audience-bound, never logged, and never sent across redirects. */
export async function loadBrokerRuntimeConfig(options: {
	origin: string;
	audience: string;
	getToken: (audience: string) => Promise<string>;
	fetch?: typeof fetch;
}): Promise<BrokerRuntimeConfig> {
	const origin = runtimeBrokerOrigin(options.origin);
	if (!options.audience || options.audience.length > 512)
		throw new Error("invalid runtime broker audience");
	const token = await options.getToken(options.audience);
	if (
		token.length > 16_384 ||
		!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
	)
		throw new Error("invalid Vercel identity token");
	const response = await (options.fetch ?? fetch)(
		`${origin}/v1/runtime-config`,
		{
			method: "POST",
			headers: { authorization: `Bearer ${token}` },
			redirect: "error",
			signal: AbortSignal.timeout(10_000),
		},
	);
	if (
		response.status !== 200 ||
		response.headers.get("content-type")?.split(";")[0]?.trim() !==
			"application/json" ||
		!response.body
	)
		throw new Error("runtime broker unavailable");
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const part = await reader.read();
			if (part.done) break;
			size += part.value.byteLength;
			if (size > 64 * 1024) {
				await reader.cancel();
				throw new Error("runtime broker response too large");
			}
			chunks.push(part.value);
		}
	} finally {
		reader.releaseLock();
	}
	return Envelope.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")))
		.config;
}
