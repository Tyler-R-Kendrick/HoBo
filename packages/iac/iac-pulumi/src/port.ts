import type { ProviderPort } from "@hobo/core";
import { createPortDescriptor } from "@hobo/core";

export const IAC_PULUMI_INTERFACE = "hobo:iac/provider";

// domain-view: the IaC provider port shape adapters satisfy. Kept in this
// package (there is no IaC port in @hobo/core) so provisioning callers depend on
// this contract rather than the concrete Pulumi Automation engine. The frozen
// return values are validated structurally by runIacBackendConformance.
export interface IacProvider {
  readonly id: string;
  readonly pulumiVersion: string;
  readonly stateBackend: unknown;
  preview(program: unknown): Promise<unknown>;
  apply(program: unknown): Promise<unknown>;
  refresh(program: unknown): Promise<unknown>;
  destroy(program: unknown): Promise<unknown>;
}

// The provider-port descriptor for this boundary, built through @hobo/core so
// the adapter's only inward dependency is the shared port vocabulary.
export const IAC_PULUMI_PORT: ProviderPort = createPortDescriptor({
  kind: "provider",
  name: "iac-pulumi",
  interface: IAC_PULUMI_INTERFACE,
  stability: "preview",
}) as ProviderPort;
