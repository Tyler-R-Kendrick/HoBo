import { parseTriggerDelivery } from "@neon/functions/triggers";

/** Neon strips client-supplied x-neon-* headers at its public proxy. This
 * provenance contract must be verified on the deployed endpoint before the
 * trigger is enabled. Relay repair is idempotent and permits at-least-once
 * delivery if the function restarts after forwarding. */
export function createNeonRepairTrigger(options: {
	triggerId: string;
	triggerName: string;
	publicOrigin: string;
	cronSecret: string;
	fetch?: typeof fetch;
	now?: () => number;
}) {
	if (
		!/^[A-Za-z0-9_-]{1,128}$/.test(options.triggerId) ||
		!/^[A-Za-z0-9_-]{1,80}$/.test(options.triggerName) ||
		Buffer.byteLength(options.cronSecret) < 32
	)
		throw new Error("invalid repair trigger configuration");
	const origin = new URL(options.publicOrigin);
	if (origin.protocol !== "https:" || origin.origin !== options.publicOrigin)
		throw new Error("invalid repair origin");
	const send = options.fetch ?? fetch;
	const now = options.now ?? Date.now;
	const seen = new Map<string, { until: number; complete: boolean }>();
	return async (request: Request): Promise<Response> => {
		const headers = { "cache-control": "no-store" };
		if (
			request.method !== "POST" ||
			new URL(request.url).pathname !== "/internal/trigger"
		)
			return new Response(null, { status: 404, headers });
		const invocationId = request.headers.get("x-neon-trigger-invocation-id");
		if (!invocationId || !/^[A-Za-z0-9_-]{1,128}$/.test(invocationId))
			return new Response(null, { status: 403, headers });
		const declared = request.headers.get("content-length");
		if (declared && (!/^\d+$/.test(declared) || Number(declared) > 4096))
			return new Response(null, { status: 413, headers });
		if (!request.body) return new Response(null, { status: 400, headers });
		let body: unknown;
		const reader = request.body.getReader();
		const deadline = Date.now() + 5000;
		try {
			const chunks: Uint8Array[] = [];
			let size = 0;
			for (;;) {
				const remaining = deadline - Date.now();
				if (remaining <= 0) throw new Error("trigger body timed out");
				let timer: ReturnType<typeof setTimeout> | undefined;
				const item = await Promise.race([
					reader.read(),
					new Promise<never>((_, reject) => {
						timer = setTimeout(
							() => reject(new Error("trigger body timed out")),
							remaining,
						);
					}),
				]).finally(() => {
					if (timer) clearTimeout(timer);
				});
				if (item.done) break;
				size += item.value.byteLength;
				if (size > 4096) {
					void reader.cancel().catch(() => {});
					return new Response(null, { status: 413, headers });
				}
				chunks.push(item.value);
			}
			body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		} catch {
			void reader.cancel().catch(() => {});
			return new Response(null, { status: 400, headers });
		} finally {
			try {
				reader.releaseLock();
			} catch {
				/* A timed-out read is still unwinding. */
			}
		}
		const parsed = parseTriggerDelivery({ headers: request.headers, body });
		if (
			!parsed.ok ||
			parsed.invocation.type !== "schedule" ||
			parsed.invocation.trigger.id !== options.triggerId ||
			parsed.invocation.trigger.name !== options.triggerName
		)
			return new Response(null, { status: 403, headers });
		const scheduled = Date.parse(parsed.invocation.data.scheduledAt);
		const current = now();
		if (
			!Number.isFinite(scheduled) ||
			scheduled < current - 30 * 60_000 ||
			scheduled > current + 60_000
		)
			return new Response(null, { status: 403, headers });
		for (const [id, entry] of seen) if (entry.until <= current) seen.delete(id);
		const prior = seen.get(parsed.invocation.invocationId);
		if (prior)
			return new Response(null, {
				status: prior.complete ? 204 : 409,
				headers,
			});
		if (seen.size >= 1024) return new Response(null, { status: 503, headers });
		// Set before the network call to bound concurrent duplicate work. A failed
		// forwarding attempt removes the entry so Neon may retry.
		seen.set(parsed.invocation.invocationId, {
			until: current + 30 * 60_000,
			complete: false,
		});
		try {
			const response = await send(`${origin.origin}/internal/tick`, {
				method: "GET",
				headers: { authorization: `Bearer ${options.cronSecret}` },
				redirect: "error",
				signal: AbortSignal.timeout(5000),
			});
			void response.body?.cancel().catch(() => {});
			if (response.status !== 204) throw new Error("repair wakeup failed");
			seen.set(parsed.invocation.invocationId, {
				until: current + 30 * 60_000,
				complete: true,
			});
			return new Response(null, { status: 204, headers });
		} catch {
			seen.delete(parsed.invocation.invocationId);
			return new Response(null, { status: 503, headers });
		}
	};
}
