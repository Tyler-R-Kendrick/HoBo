import { create } from "@bufbuild/protobuf";
import { Hono } from "hono";

import {
	type GreetingRequest,
	GreetingRequestSchema,
	GreetingResponseSchema,
} from "./_generated/greeting_pb.js";

/**
 * The single parse boundary: raw `?name` query → a derived {@link GreetingRequest}
 * message generated from `data-models/greeting.proto` (parse, don't validate).
 */
export function parseGreetingRequest(
	rawName: string | undefined,
): GreetingRequest {
	const name = (rawName ?? "").trim();
	return create(GreetingRequestSchema, {
		name: name.length > 0 ? name : "world",
	});
}

/** The hello-world API: a minimal Hono app exposing `GET /hello`. */
export const app = new Hono().get("/hello", (c) => {
	const request = parseGreetingRequest(c.req.query("name"));
	const response = create(GreetingResponseSchema, {
		message: `hello, ${request.name}`,
	});
	return c.json({ message: response.message });
});
