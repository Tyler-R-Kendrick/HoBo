/**
 * The test-only TLS fixtures (test/fixtures/tls/README.md) can only ever vouch
 * for names nobody can own: the `.test` top-level domain RFC 2606 reserves for
 * testing, and the loopback network. Their CA carries a critical
 * nameConstraints extension that permits nothing else, so even a leaked key
 * signs nothing a client would accept for a real host, and the leaves name only
 * such names.
 */
import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const fixture = (name: string) =>
	readFileSync(new URL(`./fixtures/tls/${name}`, import.meta.url), "utf8");

/** One DER element: its tag, and where its content starts and ends in `bytes`. */
interface Element {
	readonly tag: number;
	readonly start: number;
	readonly end: number;
}

function element(bytes: Uint8Array, at: number): Element {
	const tag = bytes[at] ?? 0;
	let length = bytes[at + 1] ?? 0;
	let start = at + 2;
	if (length & 0x80) {
		const octets = length & 0x7f;
		length = 0;
		for (let index = 0; index < octets; index += 1) {
			length = length * 256 + (bytes[start + index] ?? 0);
		}
		start += octets;
	}
	return { tag, start, end: start + length };
}

function children(bytes: Uint8Array, parent: Element): readonly Element[] {
	const found: Element[] = [];
	for (let at = parent.start; at < parent.end; ) {
		const next = element(bytes, at);
		found.push(next);
		at = next.end;
	}
	return found;
}

/** id-ce-nameConstraints, 2.5.29.30, as DER: OBJECT IDENTIFIER 55 1D 1E. */
const NAME_CONSTRAINTS_OID = [0x06, 0x03, 0x55, 0x1d, 0x1e];

/** A certificate's nameConstraints: whether critical, and its permitted and excluded names. */
interface NameConstraints {
	readonly critical: boolean;
	readonly permitted: readonly string[];
	readonly excluded: readonly string[];
}

function nameConstraints(pem: string): NameConstraints {
	const der = new Uint8Array(new X509Certificate(pem).raw);
	const oidAt = der.findIndex((_, index) =>
		NAME_CONSTRAINTS_OID.every((byte, offset) => der[index + offset] === byte),
	);
	if (oidAt === -1) return { critical: false, permitted: [], excluded: [] };
	let at = oidAt + NAME_CONSTRAINTS_OID.length;
	let critical = false;
	if (der[at] === 0x01) {
		const flag = element(der, at);
		critical = der[flag.start] === 0xff;
		at = flag.end;
	}
	const value = element(der, at);
	const sequence = element(der, value.start);
	const permitted: string[] = [];
	const excluded: string[] = [];
	for (const subtrees of children(der, sequence)) {
		// [0] permittedSubtrees, [1] excludedSubtrees.
		const into = subtrees.tag === 0xa0 ? permitted : excluded;
		for (const subtree of children(der, subtrees)) {
			const [base] = children(der, subtree);
			if (base === undefined) continue;
			const content = der.subarray(base.start, base.end);
			if (base.tag === 0x82)
				into.push(`DNS:${Buffer.from(content).toString("ascii")}`);
			else if (base.tag === 0x87) {
				into.push(
					`IP:${[...content.subarray(0, 4)].join(".")}/${[...content.subarray(4)].join(".")}`,
				);
			} else into.push(`tag 0x${base.tag.toString(16)}`);
		}
	}
	return { critical, permitted, excluded };
}

describe("the test-only TLS fixtures", () => {
	const ca = new X509Certificate(fixture("ca.pem"));

	it("come from a CA whose critical name constraints permit only .test names and loopback", () => {
		expect(ca.ca).toBe(true);
		expect(nameConstraints(fixture("ca.pem"))).toEqual({
			critical: true,
			permitted: ["DNS:test", "IP:127.0.0.0/255.0.0.0"],
			excluded: [],
		});
	});

	it.each([
		["loopback.pem", "IP Address:127.0.0.1"],
		["hostname.pem", "DNS:s3.mirror-lane.test"],
	])("%s names only %s, and the CA signed it", (name, altNames) => {
		const leaf = new X509Certificate(fixture(name));
		expect(leaf.subjectAltName).toBe(altNames);
		expect(leaf.subject).toMatch(/^CN=[a-z0-9.-]+\.test$/u);
		expect(leaf.checkIssued(ca)).toBe(true);
		expect(leaf.verify(ca.publicKey)).toBe(true);
	});

	it.each([
		"ca.pem",
		"loopback.pem",
		"hostname.pem",
	])("%s is valid from 2000 to 2125, so no test depends on the date", (name) => {
		const certificate = new X509Certificate(fixture(name));
		expect(new Date(certificate.validFrom).getUTCFullYear()).toBe(2000);
		expect(new Date(certificate.validTo).getUTCFullYear()).toBe(2125);
	});
});
