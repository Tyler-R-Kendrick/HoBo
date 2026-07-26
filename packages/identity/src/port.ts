import type { ProviderPort } from "@hobo/core";
import { createPortDescriptor } from "@hobo/core";

export const IDENTITY_INTERFACE = "hobo:identity/provider";

// domain-view: the identity provider port shape adapters satisfy. Kept in this
// package (there is no identity port in @hobo/core) so gateways and the token
// broker depend on this contract rather than the concrete IdentityService — a
// SPIFFE JWT-SVID issuer with an OIDC discovery/JWKS surface.
export interface IdentityProvider {
	readonly issuerUrl: string;
	discovery(): unknown;
	jwks(): { keys: unknown[] };
	contractEvidence(): unknown;
}

// The provider-port descriptor for this boundary, built through @hobo/core so
// the identity service's only inward dependency is the shared port vocabulary.
export const IDENTITY_PORT: ProviderPort = createPortDescriptor({
	kind: "provider",
	name: "identity",
	interface: IDENTITY_INTERFACE,
	stability: "preview",
}) as ProviderPort;
