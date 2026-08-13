import { Hono } from "hono";
import { training } from "@hobo/runtime";

/* @hobo.hole greet kind=trainable */
export async function greet(input: { name: string }): Promise<{ message: string }> {
	"use training";
	// Greet the caller by name. First pass: trainable syntax, not authored logic.
}

export const greetTrainable = training.define<{ name: string }, { message: string }>({
	methodRef: "{{name}}.greet",
	intent: "Greet the caller by name.",
	contract: { ref: "inferred://{{name}}.greet" },
	rubric: { exactMatch: 1 },
});
/* @hobo.end */

export const app = new Hono().get("/hello", async (c) => {
	const name = c.req.query("name")?.trim() || "world";
	return c.json(await greetTrainable({ name }));
});
