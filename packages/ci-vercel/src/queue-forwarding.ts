import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { type QueueMessage, QueueMessageSchema } from "./worker.js";

const Wakeup = z.union([
	z.object({ deliveryId: z.string().regex(/^[A-Za-z0-9-]{1,100}$/) }).strict(),
	z
		.object({
			source: z.enum(["static", "hobo-ci"]),
			name: z.literal("hobo-ci-repair"),
		})
		.strict(),
	z.null(),
]);
const MAX_BODY = 4096;

function relayOrigin(value: string): string {
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
		throw new Error("invalid queue handoff origin");
	return url.origin;
}

/** Drop nonessential producer metadata before forwarding a durable wakeup. */
export function normalizeQueueWakeup(
	message: QueueMessage,
): z.infer<typeof Wakeup> {
	message = QueueMessageSchema.parse(message);
	if (message === null) return null;
	if ("deliveryId" in message)
		return Wakeup.parse({ deliveryId: message.deliveryId });
	return Wakeup.parse({ source: message.source, name: message.name });
}

/** A callback acknowledges only after the current relay confirms processing. */
export async function forwardQueueWakeup(options: {
	origin: string;
	secret: string;
	message: unknown;
	fetch?: typeof fetch;
	timeoutMs?: number;
}): Promise<void> {
	const origin = relayOrigin(options.origin);
	if (Buffer.byteLength(options.secret) < 32)
		throw new Error("invalid queue handoff secret");
	const timeoutMs = options.timeoutMs ?? 120_000;
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000)
		throw new Error("invalid queue handoff timeout");
	const message = normalizeQueueWakeup(
		QueueMessageSchema.parse(options.message),
	);
	let response: Response;
	try {
		response = await (options.fetch ?? fetch)(
			`${origin}/internal/queue-wakeup`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${options.secret}`,
					"content-type": "application/json",
				},
				body: JSON.stringify(message),
				redirect: "error",
				signal: AbortSignal.timeout(timeoutMs),
			},
		);
	} catch {
		throw new Error("queue handoff unavailable");
	}
	void response.body?.cancel().catch(() => {});
	if (response.status !== 204) throw new Error("queue handoff failed");
}

/** Authenticate before reading a bounded payload and run only the active worker. */
export function createQueueWakeupHandler(options: {
	origin: string;
	secret: string;
	run(message: QueueMessage): Promise<void>;
}) {
	const origin = relayOrigin(options.origin);
	if (Buffer.byteLength(options.secret) < 32)
		throw new Error("invalid queue handoff secret");
	const expected = createHash("sha256")
		.update(`Bearer ${options.secret}`)
		.digest();
	return async (request: Request): Promise<Response> => {
		const headers = { "cache-control": "no-store" };
		const url = new URL(request.url);
		const actual = createHash("sha256")
			.update(request.headers.get("authorization") ?? "")
			.digest();
		if (
			request.method !== "POST" ||
			url.origin !== origin ||
			url.pathname !== "/internal/queue-wakeup" ||
			!timingSafeEqual(actual, expected)
		)
			return new Response(null, { status: 403, headers });
		if (
			request.headers.get("content-type")?.split(";")[0]?.trim() !==
			"application/json"
		)
			return new Response(null, { status: 415, headers });
		const declared = request.headers.get("content-length");
		if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY))
			return new Response(null, { status: 413, headers });
		if (!request.body) return new Response(null, { status: 400, headers });
		const reader = request.body.getReader();
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const timeout = new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error("queue handoff timed out")),
					5000,
				);
			});
			const chunks: Uint8Array[] = [];
			let total = 0;
			for (;;) {
				const part = await Promise.race([reader.read(), timeout]);
				if (part.done) break;
				total += part.value.byteLength;
				if (total > MAX_BODY)
					return new Response(null, { status: 413, headers });
				chunks.push(part.value);
			}
			const parsed = Wakeup.safeParse(
				JSON.parse(Buffer.concat(chunks).toString("utf8")),
			);
			if (!parsed.success) return new Response(null, { status: 400, headers });
			if (timer) clearTimeout(timer);
			timer = undefined;
			try {
				await options.run(parsed.data);
				return new Response(null, { status: 204, headers });
			} catch {
				return new Response(null, { status: 503, headers });
			}
		} catch {
			return new Response(null, { status: 400, headers });
		} finally {
			if (timer) clearTimeout(timer);
			void reader.cancel().catch(() => {});
			try {
				reader.releaseLock();
			} catch {
				/* A timed-out read is still unwinding. */
			}
		}
	};
}
