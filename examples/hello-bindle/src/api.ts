import { Hono } from "hono";

/**
 * Derived domain type. Untrusted query input is parsed into this once, at the
 * edge, so the rest of the handler works with a trusted value (parse, don't
 * validate) rather than re-checking raw fields.
 */
export interface GreetingRequest {
	readonly name: string;
}

export interface GreetingResponse {
	readonly message: string;
}

/** The single parse boundary: raw `?name` query → derived {@link GreetingRequest}. */
export function parseGreetingRequest(
	rawName: string | undefined,
): GreetingRequest {
	const name = (rawName ?? "").trim();
	return { name: name.length > 0 ? name : "world" };
}

/** The hello-world API: a minimal Hono app exposing `GET /hello`. */
export const app = new Hono().get("/hello", (c) => {
	const request = parseGreetingRequest(c.req.query("name"));
	const response: GreetingResponse = { message: `hello, ${request.name}` };
	return c.json(response);
});
