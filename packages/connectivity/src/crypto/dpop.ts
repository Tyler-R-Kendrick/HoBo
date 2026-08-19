/**
 * DPoP (RFC 9449) — real ES256 (P-256) proof generation and verification.
 * Used to sender-constrain access tokens for remote agent credentials.
 */
import {
	createHash,
	createPrivateKey,
	createPublicKey,
	sign as cryptoSign,
	verify as cryptoVerify,
	generateKeyPairSync,
	type KeyObject,
	randomBytes,
} from "node:crypto";

export interface DpopKeyPair {
	readonly privateKey: KeyObject;
	readonly publicKey: KeyObject;
	readonly kid: string;
	readonly jwkPublic: JsonWebKeyPublic;
}

export interface JsonWebKeyPublic {
	readonly kty: "EC";
	readonly crv: "P-256";
	readonly x: string;
	readonly y: string;
	readonly kid: string;
}

export interface MintDpopProofInput {
	readonly keyPair: DpopKeyPair;
	readonly htm: string;
	readonly htu: string;
	readonly accessToken: string;
	/** Optional additional claims. */
	readonly extra?: Readonly<Record<string, unknown>>;
	readonly now?: number;
}

export interface VerifiedDpopProof {
	readonly htm: string;
	readonly htu: string;
	readonly ath: string;
	readonly jti: string;
	readonly iat: number;
	readonly kid: string;
	readonly jwk: JsonWebKeyPublic;
}

function b64url(data: Buffer | string): string {
	const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
	return buf
		.toString("base64")
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
}

function b64urlJson(value: unknown): string {
	return b64url(JSON.stringify(value));
}

function decodeB64url(input: string): Buffer {
	const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
	const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
	return Buffer.from(b64, "base64");
}

/**
 * Generate an ES256 P-256 key pair for DPoP. Persist `exportDpopPrivateJwk`
 * under HOBO_HOME for stable agent identity across restarts.
 */
export function generateDpopKeyPair(kid?: string): DpopKeyPair {
	const { privateKey, publicKey } = generateKeyPairSync("ec", {
		namedCurve: "P-256",
	});
	const jwk = publicKey.export({ format: "jwk" }) as {
		x?: string;
		y?: string;
	};
	if (!jwk.x || !jwk.y) {
		throw new Error("dpop: failed to export public JWK coordinates");
	}
	const derivedKid =
		kid ??
		createHash("sha256").update(`${jwk.x}.${jwk.y}`).digest("hex").slice(0, 16);
	return {
		privateKey,
		publicKey,
		kid: derivedKid,
		jwkPublic: {
			kty: "EC",
			crv: "P-256",
			x: jwk.x,
			y: jwk.y,
			kid: derivedKid,
		},
	};
}

export function importDpopKeyPair(input: {
	readonly privateJwk: Record<string, unknown>;
	readonly kid?: string;
}): DpopKeyPair {
	const privateKey = createPrivateKey({
		key: input.privateJwk,
		format: "jwk",
	});
	const publicKey = createPublicKey(privateKey);
	const jwk = publicKey.export({ format: "jwk" }) as {
		x?: string;
		y?: string;
	};
	if (!jwk.x || !jwk.y) {
		throw new Error("dpop: invalid imported key");
	}
	const kid =
		input.kid ??
		(typeof input.privateJwk.kid === "string"
			? input.privateJwk.kid
			: createHash("sha256")
					.update(`${jwk.x}.${jwk.y}`)
					.digest("hex")
					.slice(0, 16));
	return {
		privateKey,
		publicKey,
		kid,
		jwkPublic: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, kid },
	};
}

export function exportDpopPrivateJwk(
	keyPair: DpopKeyPair,
): Record<string, unknown> {
	const jwk = keyPair.privateKey.export({ format: "jwk" }) as Record<
		string,
		unknown
	>;
	return { ...jwk, kid: keyPair.kid, alg: "ES256", use: "sig" };
}

export function accessTokenHash(accessToken: string): string {
	return b64url(createHash("sha256").update(accessToken, "utf8").digest());
}

/**
 * Mint a compact-serialization DPoP proof JWT (ES256).
 */
export function mintDpopProof(input: MintDpopProofInput): string {
	const now = input.now ?? Math.floor(Date.now() / 1000);
	const header = {
		typ: "dpop+jwt",
		alg: "ES256",
		jwk: {
			kty: "EC",
			crv: "P-256",
			x: input.keyPair.jwkPublic.x,
			y: input.keyPair.jwkPublic.y,
		},
		kid: input.keyPair.kid,
	};
	const payload = {
		htm: input.htm.toUpperCase(),
		htu: normalizeHtu(input.htu),
		iat: now,
		jti: randomBytes(16).toString("hex"),
		ath: accessTokenHash(input.accessToken),
		...(input.extra ?? {}),
	};
	const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
	// IEEE-P1363 (r||s) signature for JWT ES256
	const sig = cryptoSign("SHA256", Buffer.from(signingInput, "utf8"), {
		key: input.keyPair.privateKey,
		dsaEncoding: "ieee-p1363",
	});
	return `${signingInput}.${b64url(sig)}`;
}

/**
 * Verify a DPoP proof against expected method, URL, and access token.
 * Enforces ath match, htm/htu match, and iat skew window (default ±5 min).
 */
export interface DpopJtiCache {
	/** Throws if jti was already seen within TTL. */
	assertFresh(jti: string, iat: number): void;
	readonly size: number;
}

/**
 * In-process jti replay cache for DPoP (and reusable by broker server follow-on).
 * Entries expire after `ttlSeconds` (default 600).
 */
export function createDpopJtiCache(options?: {
	readonly ttlSeconds?: number;
	readonly now?: () => number;
}): DpopJtiCache {
	const ttl = options?.ttlSeconds ?? 600;
	const nowFn = options?.now ?? (() => Math.floor(Date.now() / 1000));
	const seen = new Map<string, number>();

	function sweep(now: number): void {
		for (const [jti, exp] of seen) {
			if (exp <= now) seen.delete(jti);
		}
	}

	return {
		assertFresh(jti, iat) {
			const now = nowFn();
			sweep(now);
			const existing = seen.get(jti);
			if (existing !== undefined && existing > now) {
				throw new Error("dpop: jti replay detected");
			}
			const exp = Math.max(iat, now) + ttl;
			seen.set(jti, exp);
		},
		get size() {
			return seen.size;
		},
	};
}

export function verifyDpopProof(input: {
	readonly proof: string;
	readonly htm: string;
	readonly htu: string;
	readonly accessToken: string;
	readonly maxSkewSeconds?: number;
	readonly now?: number;
	/** Optional replay defense (required for server-side verification). */
	readonly jtiCache?: DpopJtiCache;
}): VerifiedDpopProof {
	const parts = input.proof.split(".");
	if (parts.length !== 3) {
		throw new Error("dpop: malformed proof (expected 3 JWT segments)");
	}
	const [hB64, pB64, sB64] = parts as [string, string, string];
	const header = JSON.parse(decodeB64url(hB64).toString("utf8")) as {
		typ?: string;
		alg?: string;
		jwk?: { kty?: string; crv?: string; x?: string; y?: string };
		kid?: string;
	};
	if (header.typ !== "dpop+jwt") {
		throw new Error("dpop: typ must be dpop+jwt");
	}
	if (header.alg !== "ES256") {
		throw new Error("dpop: alg must be ES256");
	}
	if (
		header.jwk?.kty !== "EC" ||
		header.jwk.crv !== "P-256" ||
		!header.jwk.x ||
		!header.jwk.y
	) {
		throw new Error("dpop: header.jwk must be EC P-256 public key");
	}

	const payload = JSON.parse(decodeB64url(pB64).toString("utf8")) as {
		htm?: string;
		htu?: string;
		ath?: string;
		jti?: string;
		iat?: number;
	};
	if (payload.htm?.toUpperCase() !== input.htm.toUpperCase()) {
		throw new Error("dpop: htm mismatch");
	}
	// Bound to locals so the checks below actually narrow. The previous
	// `payload.htu ?? ""` also let an absent htu pass whenever input.htu
	// normalized to the empty string; requiring presence closes that.
	const htu = payload.htu;
	if (htu === undefined || normalizeHtu(htu) !== normalizeHtu(input.htu)) {
		throw new Error("dpop: htu mismatch");
	}
	const expectedAth = accessTokenHash(input.accessToken);
	const ath = payload.ath;
	if (ath === undefined || ath !== expectedAth) {
		throw new Error("dpop: ath mismatch");
	}
	const now = input.now ?? Math.floor(Date.now() / 1000);
	const skew = input.maxSkewSeconds ?? 300;
	if (typeof payload.iat !== "number" || Math.abs(now - payload.iat) > skew) {
		throw new Error("dpop: iat outside allowed skew");
	}
	if (typeof payload.jti !== "string" || payload.jti.length === 0) {
		throw new Error("dpop: jti required");
	}
	if (input.jtiCache) {
		input.jtiCache.assertFresh(payload.jti, payload.iat ?? now);
	}

	const publicKey = createPublicKey({
		key: {
			kty: "EC",
			crv: "P-256",
			x: header.jwk.x,
			y: header.jwk.y,
		},
		format: "jwk",
	});
	const ok = cryptoVerify(
		"SHA256",
		Buffer.from(`${hB64}.${pB64}`, "utf8"),
		{ key: publicKey, dsaEncoding: "ieee-p1363" },
		decodeB64url(sB64),
	);
	if (!ok) {
		throw new Error("dpop: signature verification failed");
	}

	const kid =
		header.kid ??
		createHash("sha256")
			.update(`${header.jwk.x}.${header.jwk.y}`)
			.digest("hex")
			.slice(0, 16);

	return {
		htm: payload.htm,
		htu,
		ath,
		jti: payload.jti,
		iat: payload.iat,
		kid,
		jwk: {
			kty: "EC",
			crv: "P-256",
			x: header.jwk.x,
			y: header.jwk.y,
			kid,
		},
	};
}

function normalizeHtu(url: string): string {
	try {
		const u = new URL(url);
		// Strip fragment and default ports; keep path without trailing slash unless root.
		u.hash = "";
		if (
			(u.protocol === "https:" && u.port === "443") ||
			(u.protocol === "http:" && u.port === "80")
		) {
			u.port = "";
		}
		let path = u.pathname;
		if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
		return `${u.protocol}//${u.host}${path}${u.search}`;
	} catch {
		return url;
	}
}
