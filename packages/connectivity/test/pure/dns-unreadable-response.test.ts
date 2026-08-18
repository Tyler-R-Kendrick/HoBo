/**
 * "I could not read the answer" is not "the record is not there".
 *
 * Both DNS providers used to collapse those two, in the same place and for the
 * same reason: a response body that failed to parse, or parsed to something
 * without a record list, fell through to an empty list. An empty list is what
 * the provider says when a zone genuinely has no records, so the caller cannot
 * tell the difference — and both callers act on it. `findRecord` returning
 * `null` is licence to create, which turns a bad minute at the provider into a
 * duplicate record on every retry. `list` returning `[]` reports an empty zone
 * to whoever asked.
 *
 * The Cloudflare instances were found by `packages/hobo/test/pact-chaos-conformance.test.ts`
 * driving the shipped driver through faults at every call index. The Route53
 * one was found by reading its sibling for the same shape afterwards — it is
 * the XML spelling of the same mistake, and it is quieter, because `res.text()`
 * has no parse step to fail: a truncated body arrives as a perfectly valid
 * string that simply contains no complete record block.
 */
import { describe, expect, it } from "vitest";

import { createCloudflareDnsProvider } from "../../src/dns/cloudflare-provider.js";
import { createRoute53DnsProvider } from "../../src/dns/route53-provider.js";

const TENANT = "acme" as never;
const ZONE = "example.com";
const RECORD = "web.example.com";

const COMPLETE_LIST = `<?xml version="1.0"?><ListResourceRecordSetsResponse xmlns="https://route53.amazonaws.com/doc/2013-04-01/"><ResourceRecordSets><ResourceRecordSet><Name>web.example.com.</Name><Type>CNAME</Type><TTL>300</TTL><ResourceRecords><ResourceRecord><Value>funnel.ts.net.</Value></ResourceRecord></ResourceRecords></ResourceRecordSet></ResourceRecordSets></ListResourceRecordSetsResponse>`;

function respond(status: number, body: string): typeof fetch {
	return (async () =>
		new Response(body, {
			status,
			headers: { "content-type": "application/json" },
		})) as unknown as typeof fetch;
}

function cloudflare(fetchImpl: typeof fetch) {
	return createCloudflareDnsProvider({
		apiToken: "test-token",
		zoneId: "zone-1",
		apiBase: "https://api.cloudflare.com/v4",
		fetchImpl,
	});
}

function route53(fetchImpl: typeof fetch) {
	return createRoute53DnsProvider({
		accessKeyId: "AKIAEXAMPLE",
		secretAccessKey: "secret",
		hostedZoneId: "Z123",
		allowUnsigned: true,
		fetchImpl,
	});
}

describe("cloudflare refuses to infer absence from an answer it did not get", () => {
	it("does not create after a 5xx lookup", async () => {
		const provider = cloudflare(
			respond(500, '{"errors":[{"message":"boom"}]}'),
		);
		await expect(
			provider.upsert(TENANT, ZONE, {
				name: RECORD,
				type: "CNAME",
				content: "funnel.ts.net",
				gatewayTarget: true,
			}),
		).rejects.toThrow(/lookup for CNAME .* failed \(500\)/);
	});

	it("does not create after a 429 lookup", async () => {
		// The nastiest of the set, because a 429 is the provider working
		// correctly under load: exactly when a retry loop is most likely to be
		// running, and exactly when duplicating is most expensive.
		const provider = cloudflare(respond(429, '{"errors":[]}'));
		await expect(
			provider.upsert(TENANT, ZONE, {
				name: RECORD,
				type: "CNAME",
				content: "funnel.ts.net",
				gatewayTarget: true,
			}),
		).rejects.toThrow(/failed \(429\)/);
	});

	it("does not create after a 200 whose body will not parse", async () => {
		const provider = cloudflare(respond(200, '{"success":true,"res'));
		await expect(
			provider.upsert(TENANT, ZONE, {
				name: RECORD,
				type: "CNAME",
				content: "funnel.ts.net",
				gatewayTarget: true,
			}),
		).rejects.toThrow(
			/refusing to treat an unreadable response as "record absent"/,
		);
	});

	it("does not report an unreadable 200 as an empty zone", async () => {
		const provider = cloudflare(respond(200, "not json at all"));
		await expect(provider.list(TENANT, ZONE)).rejects.toThrow(
			/refusing to report an unreadable response as an empty zone/,
		);
	});

	it("still reports a genuinely empty result as empty", async () => {
		// The other half. A guard that refused everything would also be wrong,
		// and this is the case that tells them apart: `result: []` is the
		// provider saying "there are none", and it must still come back as none.
		const provider = cloudflare(respond(200, '{"success":true,"result":[]}'));
		await expect(provider.list(TENANT, ZONE)).resolves.toEqual([]);
	});
});

describe("route53 refuses to infer an empty zone from a truncated body", () => {
	it("rejects a list response cut off mid-stream", async () => {
		const truncated = COMPLETE_LIST.slice(0, COMPLETE_LIST.length / 2);
		await expect(
			route53(respond(200, truncated)).list(TENANT, ZONE),
		).rejects.toThrow(/refusing to report a truncated body as an empty zone/);
	});

	it("does not fall back to the offline mirror for an unreadable answer", async () => {
		// `offlineCache` exists for network failures. A truncated response is not
		// one — the request reached Route53 and came back — so serving the stale
		// mirror here would present old state as current.
		const provider = createRoute53DnsProvider({
			accessKeyId: "AKIAEXAMPLE",
			secretAccessKey: "secret",
			hostedZoneId: "Z123",
			allowUnsigned: true,
			offlineCache: true,
			fetchImpl: respond(200, '<?xml version="1.0"?><ListResourceRecord'),
		});
		await expect(provider.list(TENANT, ZONE)).rejects.toThrow(
			/refusing to report a truncated body as an empty zone/,
		);
	});

	it("still parses a complete response", async () => {
		const listed = await route53(respond(200, COMPLETE_LIST)).list(
			TENANT,
			ZONE,
		);
		expect(listed).toHaveLength(1);
		expect(listed[0]?.name).toBe("web.example.com");
		expect(listed[0]?.content).toBe("funnel.ts.net");
	});

	it("still reports a complete but empty response as empty", async () => {
		const empty = `<?xml version="1.0"?><ListResourceRecordSetsResponse xmlns="https://route53.amazonaws.com/doc/2013-04-01/"><ResourceRecordSets></ResourceRecordSets></ListResourceRecordSetsResponse>`;
		await expect(
			route53(respond(200, empty)).list(TENANT, ZONE),
		).resolves.toEqual([]);
	});
});
