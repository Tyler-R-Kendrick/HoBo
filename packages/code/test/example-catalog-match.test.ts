/**
 * Matching a natural-language prompt to a catalog example.
 *
 * This is the front door for "make me a chat app": the shell asks whether a
 * prompt names an example it can scaffold, and a wrong answer is expensive in
 * both directions. Matching when the user did not ask replaces work they were
 * doing; failing to match makes them scaffold by hand.
 *
 * Three rules do most of the work.
 *
 * **A refine intent with no create intent never matches.** "add auth to the
 * chat app" is a request to change what exists, and scaffolding a fresh
 * example over it would overwrite the thing they were refining. Create wins
 * when both are present, because "create a new chat app and add auth" is still
 * a scaffold.
 *
 * **A phrase has to appear as a whole word run.** A one-word alias inside a
 * longer sentence is almost always coincidence — "I need to chat with support"
 * is not a request for the chat example. So single-word phrases only count
 * when they are the example's own id, or when the prompt clearly asks to
 * create something.
 *
 * **The fallback needs an explicit create-an-app intent.** "make me an app"
 * has no example in it, so the catalog's designated fallback answers — but
 * only for a prompt that asked for an app, never as a default for anything
 * unmatched.
 *
 * Ties break toward the longer phrase, then toward the entry with more
 * aliases: a two-word match is stronger evidence than a one-word one, and a
 * well-described example is more likely to be what a vague prompt meant.
 */
import { describe, expect, it } from "vitest";

import {
	type ExampleCatalogEntry,
	matchExampleRequest,
} from "../src/example-catalog.js";

function entry(
	id: string,
	options: {
		title?: string;
		aliases?: string[];
		fallback?: boolean;
	} = {},
): ExampleCatalogEntry {
	return {
		id,
		title: options.title ?? id,
		description: `the ${id} example`,
		aliases: options.aliases ?? [],
		sourceDir: `/examples/${id}`,
		origin: "packaged",
		...(options.fallback !== undefined ? { fallback: options.fallback } : {}),
	} as ExampleCatalogEntry;
}

const CHAT = entry("chat-app", {
	title: "Chat App",
	aliases: ["chat application", "messaging app"],
});
const BLOG = entry("blog", { title: "Blog", aliases: ["blog site"] });
const FALLBACK = entry("starter", { title: "Starter", fallback: true });
const CATALOG = [CHAT, BLOG, FALLBACK];

const match = (prompt: string, catalog = CATALOG) =>
	matchExampleRequest(prompt, catalog)?.id;

describe("no match", () => {
	it("declines an empty prompt", () => {
		for (const prompt of ["", "   ", "\n\t"]) {
			expect(match(prompt)).toBeUndefined();
		}
	});

	it("declines a prompt naming nothing in the catalog", () => {
		// Scaffolding something unasked-for would replace whatever the user was
		// doing. Silence is the safe answer.
		expect(match("what is the weather")).toBeUndefined();
		expect(match("run the tests")).toBeUndefined();
	});

	it("declines a refine intent even when it names an example", () => {
		// "add auth to the chat app" is a change to what exists. Scaffolding a
		// fresh copy over it would overwrite the thing being refined.
		for (const verb of [
			"refine",
			"edit",
			"change",
			"update",
			"fix",
			"add",
			"improve",
			"tweak",
			"modify",
		]) {
			expect(match(`${verb} the chat app`), verb).toBeUndefined();
		}
	});

	it("matches when create and refine intents both appear", () => {
		// "create a new chat app and add auth" is still a scaffold; the refine
		// verb describes what comes next, not what to do instead.
		expect(match("create a new chat app and add auth")).toBe("chat-app");
	});
});

describe("phrase matching", () => {
	it("matches an exact prompt", () => {
		expect(match("chat app")).toBe("chat-app");
	});

	it("matches a phrase at either end of a longer prompt", () => {
		// The phrase is what the user named; the words around it are framing.
		expect(match("chat app please")).toBe("chat-app");
		expect(match("please make a chat app")).toBe("chat-app");
		expect(match("please make a chat app for me")).toBe("chat-app");
	});

	it("requires whole-word boundaries", () => {
		// "chat apple" contains "chat app" as a substring but names something
		// else entirely.
		expect(match("build a chat application server")).toBe("chat-app");
		expect(match("chatapp")).toBeUndefined();
	});

	it("matches an alias as readily as the title", () => {
		// Aliases exist because users do not know the catalog's names. Matching
		// only the title would make them useless.
		expect(match("make me a messaging app")).toBe("chat-app");
		expect(match("scaffold a blog site")).toBe("blog");
	});

	it("matches the id itself even as a single token", () => {
		// A user who typed the id knows exactly what they want, so the
		// single-word guard does not apply.
		expect(match("blog")).toBe("blog");
	});

	it("ignores a one-word alias in a sentence with no create intent", () => {
		// "I need to chat with support" is not a request for the chat example.
		// This guard is why a one-word alias is safe to declare at all.
		expect(
			match("I need to chat with support", [
				entry("chat-app", { title: "Chat", aliases: [] }),
			]),
		).toBeUndefined();
	});

	it("accepts a one-word alias once the prompt asks to create", () => {
		expect(
			match("make me a chat", [entry("chat-app", { title: "Chat" })]),
		).toBe("chat-app");
	});

	it("normalizes case and punctuation", () => {
		// Prompts are typed, not selected. Case-sensitivity here would make the
		// match depend on whether the user held shift.
		expect(match("Make me a CHAT APP!")).toBe("chat-app");
	});

	it("matches an id written with hyphens against a spaced prompt", () => {
		// The id is a slug; nobody types hyphens in a sentence.
		expect(match("scaffold a chat app")).toBe("chat-app");
	});
});

describe("ranking", () => {
	it("prefers the longer matching phrase", () => {
		// A two-word match is stronger evidence than a one-word one: it is much
		// less likely to be coincidence.
		const catalog = [
			entry("chat", { title: "Chat" }),
			entry("chat-app", { title: "Chat App" }),
		];
		expect(match("make me a chat app", catalog)).toBe("chat-app");
	});

	it("breaks a length tie toward the entry with more aliases", () => {
		// More aliases means the example has been described more ways, which
		// makes it the likelier reading of a prompt that fits both.
		const catalog = [
			entry("a", { title: "web app" }),
			entry("b", { title: "web app", aliases: ["site", "website"] }),
		];
		expect(match("make me a web app", catalog)).toBe("b");
	});

	it("keeps the first entry when scores are equal", () => {
		// Catalog order is deliberate — packaged examples come before repo ones.
		// A later equal match must not displace an earlier one.
		const catalog = [
			entry("first", { title: "web app" }),
			entry("second", { title: "web app" }),
		];
		expect(match("make me a web app", catalog)).toBe("first");
	});
});

describe("fallback", () => {
	it("answers a create-an-app prompt that names no example", () => {
		// "make me an app" is a real request with no example in it. The
		// designated fallback is the catalog's answer to exactly that.
		for (const noun of [
			"app",
			"application",
			"example",
			"bindle",
			"project",
			"template",
		]) {
			expect(match(`make me an ${noun}`), noun).toBe("starter");
		}
	});

	it("accepts each create verb", () => {
		for (const verb of [
			"make",
			"create",
			"scaffold",
			"generate",
			"new",
			"spin up",
			"give me",
			"build me",
		]) {
			expect(match(`${verb} an app`), verb).toBe("starter");
		}
	});

	it("declines when the prompt asks to create but names no app noun", () => {
		// "make a plan" is not a scaffold request. Falling back on any create
		// verb would hijack half the things a user asks for.
		expect(match("make a plan")).toBeUndefined();
		expect(match("generate a report")).toBeUndefined();
	});

	it("declines when the prompt names an app but no create verb", () => {
		expect(match("the app is broken")).toBeUndefined();
	});

	it("declines when the catalog designates no fallback", () => {
		// Picking an arbitrary entry would scaffold something the user never
		// named, and there is no signal saying which one they meant.
		expect(match("make me an app", [CHAT, BLOG])).toBeUndefined();
	});

	it("prefers a named example over the fallback", () => {
		// The fallback is for prompts with nothing better, not a competitor to
		// an explicit name.
		expect(match("make me a chat app")).toBe("chat-app");
	});
});

describe("catalog edge cases", () => {
	it("declines against an empty catalog", () => {
		expect(match("make me a chat app", [])).toBeUndefined();
	});

	it("skips an entry whose phrases are all empty", () => {
		// A malformed entry must not match everything by matching nothing.
		const catalog = [
			{ ...entry(""), title: "", aliases: ["", "  "] } as ExampleCatalogEntry,
			CHAT,
		];
		expect(match("make me a chat app", catalog)).toBe("chat-app");
		expect(match("anything at all", catalog)).toBeUndefined();
	});
});
