import type {
	DnsProvider,
	DnsRecord,
	DnsRecordType,
	TenantId,
} from "@hobo/core";

import { createCloudflareDnsProvider } from "./cloudflare-provider.js";

export interface Route53DnsProviderOptions {
	readonly accessKeyId: string;
	readonly secretAccessKey: string;
	readonly region?: string;
	/** Hosted zone ID (Z…). Required for writes when not resolving by name. */
	readonly hostedZoneId?: string;
	readonly fetchImpl?: typeof fetch;
	/**
	 * Optional pre-signer for SigV4. When omitted, the provider uses a
	 * test/dev unsigned mode only if `allowUnsigned` is true (never default).
	 */
	readonly signRequest?: (input: {
		readonly method: string;
		readonly url: string;
		readonly headers: Record<string, string>;
		readonly body: string;
	}) => Promise<{
		readonly headers: Record<string, string>;
	}>;
	readonly allowUnsigned?: boolean;
	readonly endpoint?: string;
}

/**
 * Route53 DNS provider via ChangeResourceRecordSets (REST + injectable signer).
 * Production: inject a SigV4 signer (AWS SDK or custom). Tests inject fetch.
 */
export function createRoute53DnsProvider(
	options: Route53DnsProviderOptions,
): DnsProvider & {
	readonly kind: "route53";
	readonly store: ReadonlyMap<string, DnsRecord>;
} {
	const region = options.region ?? "us-east-1";
	const endpoint =
		options.endpoint ?? `https://route53.amazonaws.com`;
	const fetchImpl = options.fetchImpl ?? fetch;
	// Local mirror for list() when API listing is not fully wired.
	const store = new Map<string, DnsRecord>();

	function key(tenantId: TenantId, zone: string, name: string, type: string) {
		return `${tenantId}::${zone}::${name}::${type}`;
	}

	function r53Name(name: string, zone: string): string {
		const n = name.endsWith(".") ? name : `${name}.`;
		if (n.endsWith(`${zone}.`) || n === `${zone}.`) return n;
		// FQDN already?
		if (name.includes(zone)) return n;
		return `${name}.${zone}.`;
	}

	async function changeResourceRecordSets(
		zoneId: string,
		action: "UPSERT" | "DELETE",
		record: DnsRecord,
		zone: string,
	): Promise<void> {
		const fqdn = r53Name(record.name, zone);
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ChangeResourceRecordSetsRequest xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <ChangeBatch>
    <Changes>
      <Change>
        <Action>${action}</Action>
        <ResourceRecordSet>
          <Name>${escapeXml(fqdn)}</Name>
          <Type>${record.type}</Type>
          <TTL>${record.ttl ?? 300}</TTL>
          <ResourceRecords>
            <ResourceRecord>
              <Value>${escapeXml(record.type === "CNAME" && !record.content.endsWith(".") ? `${record.content}.` : record.content)}</Value>
            </ResourceRecord>
          </ResourceRecords>
        </ResourceRecordSet>
      </Change>
    </Changes>
  </ChangeBatch>
</ChangeResourceRecordSetsRequest>`;

		const url = `${endpoint}/2013-04-01/hostedzone/${zoneId}/rrset/`;
		const method = "POST";
		const headers: Record<string, string> = {
			"Content-Type": "text/xml",
			"Content-Length": String(Buffer.byteLength(xml)),
			Host: new URL(endpoint).host,
		};

		let signedHeaders = headers;
		if (options.signRequest) {
			const signed = await options.signRequest({
				method,
				url,
				headers,
				body: xml,
			});
			signedHeaders = signed.headers;
		} else if (!options.allowUnsigned) {
			throw new Error(
				"route53: signRequest is required for live AWS calls (or set allowUnsigned for tests)",
			);
		} else {
			// Dev/test path: still send credentials as headers only if unsigned allowed.
			signedHeaders = {
				...headers,
				"X-Amz-Access-Key-Id": options.accessKeyId,
				"X-Amz-Region": region,
			};
		}

		const res = await fetchImpl(url, {
			method,
			headers: signedHeaders,
			body: xml,
		});
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(
				`route53 ${action} failed (${res.status}): ${text.slice(0, 200)}`,
			);
		}
	}

	function zoneIdFor(zone: string): string {
		if (options.hostedZoneId) return options.hostedZoneId;
		// Allow tests to pass zone as zone id.
		if (zone.startsWith("Z")) return zone;
		throw new Error(
			`route53: hostedZoneId required to manage zone ${zone}`,
		);
	}

	return {
		kind: "route53",
		get store() {
			return store;
		},
		async upsert(tenantId, zone, record) {
			const zoneId = zoneIdFor(zone);
			await changeResourceRecordSets(zoneId, "UPSERT", record, zone);
			store.set(key(tenantId, zone, record.name, record.type), record);
		},
		async remove(tenantId, zone, name, type) {
			const existing = store.get(key(tenantId, zone, name, type));
			const record: DnsRecord = existing ?? {
				name,
				type,
				content: "placeholder.invalid.",
				gatewayTarget: true,
			};
			const zoneId = zoneIdFor(zone);
			await changeResourceRecordSets(zoneId, "DELETE", record, zone);
			store.delete(key(tenantId, zone, name, type));
		},
		async list(tenantId, zone) {
			const prefix = `${tenantId}::${zone}::`;
			return [...store.entries()]
				.filter(([k]) => k.startsWith(prefix))
				.map(([, v]) => v);
		},
	};
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * Factory that picks Cloudflare / Route53 / memory / dnscontrol from config.
 */
export function createDnsProviderFromConfig(input: {
	readonly kind: string;
	readonly credentials?: Readonly<Record<string, string>>;
	readonly zoneId?: string;
	readonly fetchImpl?: typeof fetch;
	readonly signRequest?: Route53DnsProviderOptions["signRequest"];
	readonly allowUnsigned?: boolean;
}): DnsProvider {
	const creds = input.credentials ?? {};
	if (input.kind === "cloudflare") {
		const token = creds.apiToken ?? creds.CLOUDFLARE_API_TOKEN ?? "";
		if (!token) {
			throw new Error("cloudflare provider requires credentials.apiToken");
		}
		return createCloudflareDnsProvider({
			apiToken: token,
			...(creds.zoneId || input.zoneId
				? { zoneId: creds.zoneId ?? input.zoneId }
				: {}),
			...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
		});
	}
	if (input.kind === "route53") {
		const accessKeyId = creds.accessKeyId ?? creds.AWS_ACCESS_KEY_ID ?? "";
		const secretAccessKey =
			creds.secretAccessKey ?? creds.AWS_SECRET_ACCESS_KEY ?? "";
		if (!accessKeyId || !secretAccessKey) {
			throw new Error(
				"route53 provider requires credentials.accessKeyId and secretAccessKey",
			);
		}
		return createRoute53DnsProvider({
			accessKeyId,
			secretAccessKey,
			...(creds.region ? { region: creds.region } : {}),
			...(creds.hostedZoneId || input.zoneId
				? { hostedZoneId: creds.hostedZoneId ?? input.zoneId }
				: {}),
			...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
			...(input.signRequest ? { signRequest: input.signRequest } : {}),
			allowUnsigned: input.allowUnsigned === true,
		});
	}
	throw new Error(`createDnsProviderFromConfig: unsupported kind ${input.kind}`);
}
