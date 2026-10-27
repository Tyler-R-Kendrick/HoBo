import {
	create,
	type DescMessage,
	fromJsonString,
	toJsonString,
} from "@bufbuild/protobuf";
import {
	AccountSchema,
	AccountStateSchema,
	LeaseSchema,
	ReconcileRequestSchema,
	RepositorySetupRequestSchema,
	SnapshotSchema,
} from "@hobo/ci";
import {
	OnboardingOperationSchema,
	OnboardingPrincipalSchema,
} from "./_generated/onboarding_pb.js";

type ProtobufInput<Desc extends DescMessage> = NonNullable<
	Parameters<typeof create<Desc>>[1]
>;
type ProtobufMessage<Desc extends DescMessage> = ReturnType<
	typeof create<Desc>
>;

/** Status is zero for local validation, credentials or transport failures.
 * Error messages never contain response bodies, tokens or request values. */
export class CiRelayClientError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "CiRelayClientError";
	}
}
function invalid(message: string): never {
	throw new CiRelayClientError(0, message);
}
function uuid(id: string): void {
	if (
		!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)
	)
		invalid("invalid operation or lease identifier");
}
function revision(value: number): string {
	if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
		invalid("invalid configuration revision");
	return `"${value}"`;
}
function origin(value: string, allowInsecureLoopback: boolean): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return invalid("invalid relay origin");
	}
	const loopback =
		allowInsecureLoopback &&
		url.protocol === "http:" &&
		["127.0.0.1", "localhost"].includes(url.hostname);
	if (
		(!loopback && url.protocol !== "https:") ||
		url.username ||
		url.password ||
		url.pathname !== "/" ||
		url.search ||
		url.hash
	)
		invalid(
			"relay requires an HTTPS origin or explicit insecure loopback development mode",
		);
	return url.origin;
}
function encode<Desc extends DescMessage>(
	schema: Desc,
	input: ProtobufInput<Desc>,
): string {
	try {
		return toJsonString(schema, create(schema, input));
	} catch {
		return invalid("invalid protobuf request");
	}
}

/** Account tokens are obtained per operation; tenant routing always uses /self. */
export function createCiRelayClient(options: {
	origin: string;
	accountToken: () => string | Promise<string>;
	fetch?: typeof fetch;
	allowInsecureLoopback?: boolean;
}) {
	const base = origin(options.origin, options.allowInsecureLoopback ?? false);
	const send = options.fetch ?? fetch;
	async function request<Desc extends DescMessage>(
		path: string,
		method: "GET" | "PUT" | "POST",
		schema: Desc,
		body?: string,
		match?: string,
	): Promise<ProtobufMessage<Desc>> {
		let token: string;
		try {
			token = await options.accountToken();
		} catch {
			return invalid("account credentials unavailable");
		}
		if (!token || /\s/.test(token) || token.length > 1024)
			invalid("invalid account credentials");
		const headers = new Headers({ Authorization: `Bearer ${token}` });
		if (method !== "GET") headers.set("Content-Type", "application/json");
		if (match !== undefined) headers.set("If-Match", match);
		const init: RequestInit = {
			method,
			headers,
			redirect: "error",
			signal: AbortSignal.timeout(30000),
		};
		if (body !== undefined) init.body = body;
		let response: Response;
		try {
			response = await send(`${base}/v1/accounts/self/${path}`, init);
		} catch {
			throw new CiRelayClientError(
				0,
				"relay transport failed; operation outcome may be unconfirmed",
			);
		}
		let responseOrigin = base;
		try {
			if (response.url) responseOrigin = new URL(response.url).origin;
		} catch {
			throw new CiRelayClientError(
				response.status,
				"invalid relay response origin",
			);
		}
		if (response.redirected || responseOrigin !== base)
			throw new CiRelayClientError(
				response.status,
				"relay response crossed origin or redirected",
			);
		if (!response.ok)
			throw new CiRelayClientError(
				response.status,
				`relay request failed (${response.status})`,
			);
		try {
			return fromJsonString(schema, await response.text());
		} catch {
			throw new CiRelayClientError(
				response.status,
				"invalid protobuf relay response",
			);
		}
	}
	return {
		getPolicy() {
			return request("policy", "GET", AccountStateSchema);
		},
		putPolicy(
			account: ProtobufInput<typeof AccountSchema>,
			version: { revision: number },
		) {
			const match = revision(version.revision);
			const body = encode(AccountSchema, account);
			return request("policy", "PUT", AccountStateSchema, body, match);
		},
		getInstallations() {
			return request("installations", "GET", OnboardingPrincipalSchema);
		},
		prepareRepository(
			input: ProtobufInput<typeof RepositorySetupRequestSchema>,
		) {
			return request(
				"repositories/prepare",
				"POST",
				OnboardingOperationSchema,
				encode(RepositorySetupRequestSchema, input),
			);
		},
		getSetup(id: string) {
			uuid(id);
			return request(`repositories/${id}`, "GET", OnboardingOperationSchema);
		},
		applySetup(id: string) {
			uuid(id);
			return request(
				`repositories/${id}/apply`,
				"POST",
				OnboardingOperationSchema,
			);
		},
		connectSetup(id: string, version: { revision: number }) {
			uuid(id);
			const match = revision(version.revision);
			return request(
				`repositories/${id}/connect`,
				"POST",
				OnboardingOperationSchema,
				undefined,
				match,
			);
		},
		getLeases() {
			return request("leases", "GET", SnapshotSchema);
		},
		getLease(id: string) {
			uuid(id);
			return request(`leases/${id}`, "GET", LeaseSchema);
		},
		reconcileLease(id: string, hostRunId: number) {
			uuid(id);
			if (!Number.isSafeInteger(hostRunId) || hostRunId < 1)
				invalid("invalid host run identifier");
			return request(
				`leases/${id}/reconcile`,
				"POST",
				LeaseSchema,
				encode(ReconcileRequestSchema, { hostRunId }),
			);
		},
	};
}
