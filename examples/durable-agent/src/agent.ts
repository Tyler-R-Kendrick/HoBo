import { create } from "@bufbuild/protobuf";
import { agent, tokenCapability } from "@hobo/runtime";

import {
	type OrderCommand,
	OrderCommandSchema,
	type OrderReceipt,
	OrderReceiptSchema,
} from "./_generated/agent_run_pb.js";

/** The broker provider/scope the agent is granted (`token:acme-cloud`). */
export const TOKEN_PROVIDER = "acme-cloud";
export const TOKEN_SCOPE = "database:write";

/**
 * The single parse boundary: untrusted input → a derived {@link OrderCommand}
 * message generated from `data-models/agent_run.proto` (parse, don't
 * validate). The agent body only ever sees a parsed command.
 */
export function parseOrderCommand(raw: unknown): OrderCommand {
	if (typeof raw !== "object" || raw === null) {
		throw new TypeError("order command must be a JSON object");
	}
	const { orderId } = raw as { orderId?: unknown };
	if (typeof orderId !== "string" || orderId.trim().length === 0) {
		throw new TypeError("order command orderId must be a non-empty string");
	}
	return create(OrderCommandSchema, { orderId: orderId.trim() });
}

interface WriteOrderResult {
	ok: boolean;
	orderId: string;
	tokenRef: string;
}

/**
 * A durable ops agent (`@hobo/runtime`'s `agent()`): it mints a brokered
 * credential through the deny-by-default capability membrane, writes the order
 * via its one declared tool (a journaled step), emits an `order.Written`
 * event, and returns a derived {@link OrderReceipt}. Undeclared tools or
 * token providers are refused with a typed `CapabilityDeniedError`.
 */
export const opsAgent = agent<OrderCommand, OrderReceipt>({
	name: "ops",
	tools: [
		{
			name: "writeOrder",
			run(input) {
				const { orderId, tokenRef } = input as {
					orderId: string;
					tokenRef: string;
				};
				return { ok: true, orderId, tokenRef } satisfies WriteOrderResult;
			},
		},
	],
	capabilities: [tokenCapability(TOKEN_PROVIDER)],
	async run(ctx, command) {
		// Journaled as a step so the minted handle is replayed, never re-minted.
		const token = await ctx.step("mint-broker-token", () =>
			ctx.token({ provider: TOKEN_PROVIDER, scope: TOKEN_SCOPE }),
		);
		const written = (await ctx.tool("writeOrder", {
			orderId: command.orderId,
			tokenRef: token.ref,
		})) as WriteOrderResult;
		await ctx.emit("order.Written", written);
		return create(OrderReceiptSchema, {
			orderId: written.orderId,
			tokenRef: written.tokenRef,
		});
	},
});
