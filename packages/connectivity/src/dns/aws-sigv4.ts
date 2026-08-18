/**
 * AWS Signature Version 4 (SigV4) for Route53 and other AWS REST APIs.
 * Zero SDK dependency — pure Node crypto.
 * Spec: https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html
 */
import { createHash, createHmac } from "node:crypto";

export interface AwsCredentials {
	readonly accessKeyId: string;
	readonly secretAccessKey: string;
	readonly sessionToken?: string;
}

export interface SignAwsRequestInput {
	readonly method: string;
	readonly url: string;
	readonly headers?: Readonly<Record<string, string>>;
	readonly body?: string;
	readonly region: string;
	readonly service: string;
	readonly credentials: AwsCredentials;
	/** Override signing clock (tests). */
	readonly now?: Date;
}

export interface SignedAwsRequest {
	readonly headers: Record<string, string>;
	readonly authorization: string;
	readonly amzDate: string;
	readonly credentialScope: string;
}

export function sha256Hex(data: string | Buffer): string {
	return createHash("sha256").update(data).digest("hex");
}

export function hmac(key: Buffer | string, data: string): Buffer {
	return createHmac("sha256", key).update(data, "utf8").digest();
}

function amzDate(now: Date): { amzDate: string; dateStamp: string } {
	const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
	// 20260727T153045Z
	const amz = iso.endsWith("Z") ? iso : `${iso}Z`;
	return { amzDate: amz, dateStamp: amz.slice(0, 8) };
}

function canonicalUri(pathname: string): string {
	if (!pathname || pathname === "") return "/";
	// Encode each segment; preserve slashes.
	return pathname
		.split("/")
		.map((seg) => encodeURIComponent(decodeURIComponent(seg)))
		.join("/")
		.replace(/%2F/gi, "/");
}

function canonicalQuery(search: string): string {
	if (!search || search === "?") return "";
	const q = search.startsWith("?") ? search.slice(1) : search;
	if (!q) return "";
	const pairs = q.split("&").map((part) => {
		const eq = part.indexOf("=");
		if (eq < 0) return [part, ""] as const;
		return [part.slice(0, eq), part.slice(eq + 1)] as const;
	});
	pairs.sort((a, b) => {
		const k = a[0].localeCompare(b[0]);
		return k !== 0 ? k : a[1].localeCompare(b[1]);
	});
	return pairs
		.map(
			([k, v]) =>
				`${encodeURIComponent(decodeURIComponent(k))}=${encodeURIComponent(decodeURIComponent(v))}`,
		)
		.join("&");
}

/**
 * Sign an AWS request. Returns headers including Authorization and X-Amz-Date.
 */
export function signAwsRequest(input: SignAwsRequestInput): SignedAwsRequest {
	const url = new URL(input.url);
	const now = input.now ?? new Date();
	const { amzDate: xAmzDate, dateStamp } = amzDate(now);
	const payloadHash = sha256Hex(input.body ?? "");
	const host = url.host;

	const headers: Record<string, string> = {
		...(input.headers ?? {}),
		host,
		"x-amz-date": xAmzDate,
		"x-amz-content-sha256": payloadHash,
	};
	if (input.credentials.sessionToken) {
		headers["x-amz-security-token"] = input.credentials.sessionToken;
	}

	// Canonical headers: lowercase keys, sorted, trimmed values.
	const headerEntries = Object.entries(headers)
		.map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, " ")] as const)
		.sort((a, b) => a[0].localeCompare(b[0]));
	const signedHeaderNames = headerEntries.map(([k]) => k);
	const canonicalHeaders = `${headerEntries
		.map(([k, v]) => `${k}:${v}`)
		.join("\n")}\n`;
	const signedHeaders = signedHeaderNames.join(";");

	const canonicalRequest = [
		input.method.toUpperCase(),
		canonicalUri(url.pathname),
		canonicalQuery(url.search),
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	].join("\n");

	const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
	const stringToSign = [
		"AWS4-HMAC-SHA256",
		xAmzDate,
		credentialScope,
		sha256Hex(canonicalRequest),
	].join("\n");

	const kDate = hmac(`AWS4${input.credentials.secretAccessKey}`, dateStamp);
	const kRegion = hmac(kDate, input.region);
	const kService = hmac(kRegion, input.service);
	const kSigning = hmac(kService, "aws4_request");
	const signature = createHmac("sha256", kSigning)
		.update(stringToSign, "utf8")
		.digest("hex");

	const authorization = `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

	const outHeaders: Record<string, string> = {
		...headers,
		Authorization: authorization,
	};

	return {
		headers: outHeaders,
		authorization,
		amzDate: xAmzDate,
		credentialScope,
	};
}

/** Default Route53 signer using built-in SigV4. */
export function createRoute53SigV4Signer(
	credentials: AwsCredentials,
): (input: {
	readonly method: string;
	readonly url: string;
	readonly headers: Record<string, string>;
	readonly body: string;
}) => Promise<{ readonly headers: Record<string, string> }> {
	return async (input) => {
		const signed = signAwsRequest({
			method: input.method,
			url: input.url,
			headers: input.headers,
			body: input.body,
			// Route53 is a global service; signing region is us-east-1.
			region: "us-east-1",
			service: "route53",
			credentials,
		});
		return { headers: signed.headers };
	};
}
