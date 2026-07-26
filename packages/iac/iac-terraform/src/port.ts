import type { ProviderPort } from "@hobo/core";
import { createPortDescriptor } from "@hobo/core";

// public-contract: the IaC provider port interface id this boundary serves.
export const IAC_TERRAFORM_INTERFACE = "hobo:iac/provider";

// domain-view: the IaC provider port shape adapters satisfy — the same
// boundary contract @hobo/iac-pulumi declares, so provisioning callers depend
// on the port rather than a concrete HCL binary.
export interface IacProvider {
	readonly id: string;
	readonly binary: string;
	readonly toolchainVersion: string;
	readonly stateBackend: unknown;
	preview(program: unknown): Promise<unknown>;
	apply(program: unknown): Promise<unknown>;
	refresh(program: unknown): Promise<unknown>;
	destroy(program: unknown): Promise<unknown>;
}

// The provider-port descriptor for this boundary, built through @hobo/core so
// the adapter's only inward dependency is the shared port vocabulary.
export const IAC_TERRAFORM_PORT: ProviderPort = createPortDescriptor({
	kind: "provider",
	name: "iac-terraform",
	interface: IAC_TERRAFORM_INTERFACE,
	stability: "preview",
}) as ProviderPort;
