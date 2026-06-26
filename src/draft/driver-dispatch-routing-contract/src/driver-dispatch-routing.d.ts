import type {
  Driver,
  DriverId,
  MatchContext
} from "../../resource-definition-driver-contract/src/resource-definition-driver-contract.d.ts";

export const DRIVER_DISPATCH_ROUTING_VERSION: "hobo.driver-dispatch-routing/v1";

export class DriverDispatchError extends Error {
  code: string;
  details: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>);
}

export type DispatchDefinition = {
  id: string;
  provider: string;
  driver: DriverId;
};

export type DispatchResource = {
  id: string;
  type?: string;
  name?: string;
  deps?: string[];
};

export type PlaceholderRef = {
  from: string;
  output: string;
};

export type DependentPlaceholders = {
  resourceId: string;
  placeholders: Record<string, PlaceholderRef>;
};

export type DriverDispatchInput = {
  definition: DispatchDefinition;
  resource: DispatchResource;
  context?: MatchContext & { correlationId?: string };
  inputs?: Record<string, unknown>;
  oldState?: unknown;
  state?: unknown;
  dependents?: DependentPlaceholders[];
};

export type DriverDispatchEvent = {
  id: string;
  type: string;
  schema: typeof DRIVER_DISPATCH_ROUTING_VERSION;
  seq: number;
  time: string;
  data: Record<string, unknown>;
};

export type DriverDispatchRouter = {
  registry: Map<DriverId, Driver>;
  provision(input: DriverDispatchInput): Promise<Record<string, unknown>>;
  destroy(input: DriverDispatchInput): Promise<Record<string, unknown>>;
  refresh(input: DriverDispatchInput): Promise<Record<string, unknown>>;
};

export declare function createDriverDispatchRouter(input?: {
  drivers?: Driver[];
  executor?: unknown;
  tokenBroker?: unknown;
}): DriverDispatchRouter;

export declare function createFixtureDriver(id: DriverId, options?: Record<string, unknown>): Driver & {
  calls: {
    provision: unknown[];
    destroy: unknown[];
    refresh: unknown[];
  };
};

export declare function createFixtureResource(id: string, overrides?: Partial<DispatchResource>): DispatchResource;
