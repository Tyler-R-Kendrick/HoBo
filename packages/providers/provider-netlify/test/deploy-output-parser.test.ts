/**
 * Parsing `netlify deploy --allow-anonymous` output.
 *
 * This parser exists because a CLI's stdout is not an API. `--json` often
 * pretty-prints, sometimes interleaves progress lines, and the field names have
 * moved across versions — so the parser tries three strategies in order:
 * whole-stdout JSON, then any single line that is JSON, then a bare URL match.
 *
 * A fallback chain is worth testing precisely because it *hides* regressions:
 * when the first strategy silently stops working, the last one still returns
 * something plausible, and nobody notices until a claim URL is wrong. So each
 * strategy is exercised in isolation, and the field-name alternatives are
 * pinned individually rather than through whichever one happens to be first.
 *
 * The password handling is the sharp edge. Drop sites are password-gated until
 * claimed, and the password is appended as a URL *fragment* rather than a query
 * parameter so it is not sent to Netlify's servers on the claim request.
 */
import { describe, expect, it } from "vitest";

import { parseNetlifyAnonymousDeployOutput } from "../src/temporary-station.js";

const parse = parseNetlifyAnonymousDeployOutput;

describe("whole-stdout JSON", () => {
	it("reads a pretty-printed blob", () => {
		const result = parse(`
{
  "site_url": "https://cheerful-otter-123.netlify.app",
  "deploy_id": "dep-1",
  "claim_url": "https://app.netlify.com/drop/claim?token=t"
}`);
		expect(result).toEqual({
			deployId: "dep-1",
			stationUrl: "https://cheerful-otter-123.netlify.app",
			claimUrl: "https://app.netlify.com/drop/claim?token=t",
		});
	});

	it("finds the blob amid surrounding progress chatter", () => {
		const result = parse(
			`Deploying...\n{"site_url":"https://x.netlify.app","deploy_id":"d1"}\nDone.`,
		);
		expect(result.stationUrl).toBe("https://x.netlify.app");
	});

	it.each([
		"site_url",
		"url",
		"deploy_url",
		"deployUrl",
		"ssl_url",
	])("accepts %s as the site URL", (field) => {
		const result = parse(
			JSON.stringify({ [field]: "https://x.netlify.app", deploy_id: "d1" }),
		);
		expect(result.stationUrl).toBe("https://x.netlify.app");
	});

	it("prefers site_url when several URL fields are present", () => {
		const result = parse(
			JSON.stringify({
				site_url: "https://chosen.netlify.app",
				url: "https://other.netlify.app",
				deploy_id: "d1",
			}),
		);
		expect(result.stationUrl).toBe("https://chosen.netlify.app");
	});

	it.each([
		"deploy_id",
		"deployId",
		"site_id",
		"id",
	])("accepts %s as the deploy id", (field) => {
		const result = parse(
			JSON.stringify({
				site_url: "https://x.netlify.app",
				[field]: "the-id",
			}),
		);
		expect(result.deployId).toBe("the-id");
	});

	it("adds a scheme to a bare hostname", () => {
		const result = parse(
			JSON.stringify({ site_url: "x.netlify.app", deploy_id: "d1" }),
		);
		expect(result.stationUrl).toBe("https://x.netlify.app");
	});

	it("upgrades http to https, since this URL goes to a browser", () => {
		const result = parse(
			JSON.stringify({ site_url: "http://x.netlify.app", deploy_id: "d1" }),
		);
		expect(result.stationUrl).toBe("https://x.netlify.app");
	});

	it("synthesizes a claim URL from the hostname when none is given", () => {
		const result = parse(
			JSON.stringify({
				site_url: "https://slug-42.netlify.app",
				deploy_id: "d1",
			}),
		);
		expect(result.claimUrl).toBe("https://app.netlify.com/drop/slug-42");
	});

	it("falls back to the hostname slug when no deploy id is present", () => {
		const result = parse(
			JSON.stringify({
				site_url: "https://slug-42.netlify.app",
				claim_url: "https://app.netlify.com/drop/claim",
			}),
		);
		expect(result.deployId).toBe("slug-42");
	});
});

describe("the password on a drop site", () => {
	it("appends the password as a fragment on a synthesized claim URL", () => {
		// Fragment, not query: a fragment is never sent to the server, so the
		// password does not travel to Netlify on the claim request.
		const result = parse(
			JSON.stringify({
				site_url: "https://slug.netlify.app",
				deploy_id: "d1",
				password: "hunter2",
			}),
		);
		expect(result.claimUrl).toBe(
			"https://app.netlify.com/drop/slug#password=hunter2",
		);
	});

	it("appends the password to a supplied claim URL that has no query", () => {
		const result = parse(
			JSON.stringify({
				site_url: "https://x.netlify.app",
				deploy_id: "d1",
				claim_url: "https://app.netlify.com/drop/claim",
				password: "hunter2",
			}),
		);
		expect(result.claimUrl).toContain("#password=hunter2");
	});

	it("uses & when the claim URL already has a query string", () => {
		const result = parse(
			JSON.stringify({
				site_url: "https://x.netlify.app",
				deploy_id: "d1",
				claim_url: "https://app.netlify.com/drop/claim?token=t",
				password: "hunter2",
			}),
		);
		expect(result.claimUrl).toBe(
			"https://app.netlify.com/drop/claim?token=t&password=hunter2",
		);
	});

	it("does not append a second password when one is already there", () => {
		const claim = "https://app.netlify.com/drop/claim?password=already";
		const result = parse(
			JSON.stringify({
				site_url: "https://x.netlify.app",
				deploy_id: "d1",
				claim_url: claim,
				password: "hunter2",
			}),
		);
		expect(result.claimUrl).toBe(claim);
	});

	it("percent-encodes a password with URL-significant characters", () => {
		// An unencoded & would truncate the password at the ampersand.
		const result = parse(
			JSON.stringify({
				site_url: "https://x.netlify.app",
				deploy_id: "d1",
				password: "a&b c",
			}),
		);
		expect(result.claimUrl).toContain("password=a%26b%20c");
	});

	it("ignores an empty password rather than appending an empty fragment", () => {
		const result = parse(
			JSON.stringify({
				site_url: "https://slug.netlify.app",
				deploy_id: "d1",
				password: "",
			}),
		);
		expect(result.claimUrl).toBe("https://app.netlify.com/drop/slug");
	});
});

describe("line-by-line JSON", () => {
	it("finds a JSON line when the whole-stdout parse fails", () => {
		// Trailing chatter containing a brace defeats the first strategy; the
		// per-line scan is what recovers it.
		const result = parse(
			`{ not json at all\n{"site_url":"https://x.netlify.app","deploy_id":"d1"}\n} trailing`,
		);
		expect(result.stationUrl).toBe("https://x.netlify.app");
	});

	it("keeps scanning past a malformed JSON line", () => {
		const result = parse(
			`{"broken": \n{"site_url":"https://x.netlify.app","deploy_id":"d1"}\n}`,
		);
		expect(result.deployId).toBe("d1");
	});
});

describe("the URL fallback", () => {
	it("extracts a netlify.app URL from plain text", () => {
		const result = parse("Website draft URL: https://calm-tree-77.netlify.app");
		expect(result.stationUrl).toBe("https://calm-tree-77.netlify.app");
	});

	it("derives the deploy id from the hostname", () => {
		expect(parse("live at https://calm-tree-77.netlify.app").deployId).toBe(
			"calm-tree-77",
		);
	});

	it("synthesizes a drop claim URL", () => {
		expect(parse("https://calm-tree-77.netlify.app").claimUrl).toBe(
			"https://app.netlify.com/drop/calm-tree-77",
		);
	});

	it("prefers a real claim URL found in the text", () => {
		const result = parse(
			"site https://x.netlify.app claim at https://app.netlify.com/drop/claim-me",
		);
		expect(result.claimUrl).toBe("https://app.netlify.com/drop/claim-me");
	});

	it("strips trailing punctuation from a URL in prose", () => {
		// "deployed to https://x.netlify.app." — the period is not part of it.
		expect(parse("deployed to https://x.netlify.app.").stationUrl).toBe(
			"https://x.netlify.app",
		);
	});

	it("strips a trailing parenthesis", () => {
		expect(parse("(see https://x.netlify.app)").stationUrl).toBe(
			"https://x.netlify.app",
		);
	});

	it("upgrades an http URL found in text", () => {
		expect(parse("at http://x.netlify.app").stationUrl).toBe(
			"https://x.netlify.app",
		);
	});

	it("falls through to the URL strategy when JSON has no usable URL", () => {
		const result = parse(
			`{"deploy_id":"d1"}\nBut the site is at https://x.netlify.app`,
		);
		expect(result.stationUrl).toBe("https://x.netlify.app");
	});

	it("falls through when JSON has a URL but no id or claim URL", () => {
		// Neither identifier means the blob cannot produce a claimable result.
		const result = parse(
			`{"site_url":"https://x.netlify.app"}\nclaim https://app.netlify.com/drop/real`,
		);
		expect(result.claimUrl).toBe("https://app.netlify.com/drop/real");
	});
});

describe("refusals", () => {
	it("rejects empty output", () => {
		expect(() => parse("")).toThrow(/empty output/u);
	});

	it("rejects whitespace-only output", () => {
		expect(() => parse("   \n  ")).toThrow(/empty output/u);
	});

	it("rejects output with no netlify.app URL anywhere", () => {
		expect(() => parse("Deploy failed: quota exceeded")).toThrow(
			/missing \*\.netlify\.app URL/u,
		);
	});

	it("points at the CLI flag in its failure message", () => {
		// The recovery step, in the error rather than in a runbook nobody reads.
		expect(() => parse("nothing useful")).toThrow(/--allow-anonymous/u);
	});

	it("does not accept netlify.app as a prefix of another domain", () => {
		expect(() => parse("https://netlify.app.evil.example/x")).toThrow(
			/missing \*\.netlify\.app URL/u,
		);
	});

	it("does not accept netlify.app appearing in a path", () => {
		// Found while writing these tests: the fallback regex matched
		// `netlify.app` anywhere in the URL, so a path segment was adopted as the
		// station host. This is the last-resort strategy, which makes it the one
		// place a wrong match is least likely to be noticed.
		expect(() => parse("https://evil.example/netlify.app")).toThrow(
			/missing \*\.netlify\.app URL/u,
		);
	});

	it("does not accept netlify.app appearing in a query string", () => {
		expect(() => parse("https://evil.example/?u=netlify.app")).toThrow(
			/missing \*\.netlify\.app URL/u,
		);
	});

	it("still accepts a real subdomain followed by a path", () => {
		expect(parse("https://slug.netlify.app/deploy/1").stationUrl).toBe(
			"https://slug.netlify.app/deploy/1",
		);
	});
});

describe("determinism", () => {
	it("returns the same result for the same output", () => {
		const stdout = JSON.stringify({
			site_url: "https://x.netlify.app",
			deploy_id: "d1",
		});
		expect(parse(stdout)).toEqual(parse(stdout));
	});
});
