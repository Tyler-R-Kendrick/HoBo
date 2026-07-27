import { create } from "@bufbuild/protobuf";
import { Hono } from "hono";

import {
	type GreetingRequest,
	GreetingRequestSchema,
	GreetingResponseSchema,
} from "./_generated/greeting_pb.js";
import {
	API_GREETING_PREFIX_KEY,
	type ConfigEnv,
	resolveBindleConfig,
} from "./config.js";

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

/**
 * Build the greeting using the bindle-injected GREETING_PREFIX.
 * Without camp injection this throws — the intermediary is required.
 */
export function buildGreeting(
	rawName: string | undefined,
	env: ConfigEnv = process.env,
): { message: string; greetingPrefix: string; via: "bindle-env" } {
	const greetingPrefix = resolveBindleConfig(API_GREETING_PREFIX_KEY, env);
	const request = parseGreetingRequest(rawName);
	const response = create(GreetingResponseSchema, {
		message: `${greetingPrefix}, ${request.name}`,
	});
	return {
		message: response.message,
		greetingPrefix,
		via: "bindle-env",
	};
}

/** The hello-world API: a minimal Hono app exposing `GET /hello`. */
export const app = new Hono().get("/hello", (c) => {
	const body = buildGreeting(c.req.query("name"));
	return c.json(body);
});
