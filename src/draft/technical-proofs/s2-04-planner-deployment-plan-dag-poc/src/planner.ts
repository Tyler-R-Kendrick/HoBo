import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  capabilityDecisionToMatchEvent,
  capabilityDecisionToPlanRejectedEvent,
  capabilityRequest,
  decideCapabilityNegotiatedDefinition,
  defineCapability,
} from "../../capability-negotiation-contract/src/capability-negotiation.js";
import {
  createPlannedEvent,
  validateControlPlaneEvent,
} from "../../control-plane-event-schema-contract/src/control-plane-events.js";
import {
  canonicalJson,
  planContentAddress,
  validateDeploymentPlan,
} from "../../deployment-plan-ir-contract/src/deployment-plan-ir.js";
import { canonicalManifestHash } from "../../hobo-manifest-contract/src/manifest.js";
import { plan as planSkeleton } from "../../planner-dag-skeleton-contract/src/planner.js";
import { createResourceCatalog } from "../../resource-definition-driver-contract/src/resource-definition-driver-contract.js";

export const PLANNER_VERSION = "hobo.planner/v1";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(__dirname, "..", "fixtures");

export class PlannerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "PlannerError";
    this.code = code;
  }
}

export async function loadManifestFixture(name: string) {
  const filePath = path.join(FIXTURE_ROOT, `${name}.manifest.json`);
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function loadGoldenFixture(name: string) {
  const filePath = path.join(FIXTURE_ROOT, "golden", `${name}.json`);
  return JSON.parse(await readFile(filePath, "utf8"));
}

export function createCheckoutProdRegistry() {
  const catalog = createResourceCatalog({
    id: "checkout-prod-catalog",
    contentHash: "sha256:catalog-control-plane-001",
  });

  for (const definition of [
    {
      id: "aws-rds-postgres",
      type: "database",
      provider: "aws-rds",
      driver: "terraform",
      match: { envType: "production" },
    },
    {
      id: "azure-container-http",
      type: "service",
      provider: "azure-container",
      driver: "container",
      match: { envType: "production" },
    },
    {
      id: "cloudflare-workers-edge",
      type: "gateway",
      provider: "cloudflare-workers",
      driver: "custom-webhook",
      match: { envType: "production" },
    },
    {
      id: "local-container-worker",
      type: "queue",
      provider: "local-container",
      driver: "echo",
      match: { envType: "production" },
    },
  ]) {
    catalog.register(definition);
  }

  return {
    catalog,
    capabilitiesByProvider: {
      "aws-rds": [defineCapability({ provider: "aws-rds", port: "database", features: ["managed", "postgres"] })],
      "azure-container": [
        defineCapability({ provider: "azure-container", port: "containerService", features: ["http"] }),
      ],
      "cloudflare-workers": [
        defineCapability({ provider: "cloudflare-workers", port: "gateway", features: ["http", "edge"] }),
      ],
      "local-container": [defineCapability({ provider: "local-container", port: "queue", features: ["worker"] })],
    },
  };
}

export function createHelloBindleRegistry() {
  const catalog = createResourceCatalog({
    id: "hello-bindle-catalog",
    contentHash: "sha256:catalog-hello-bindle-001",
  });

  catalog.register({
    id: "local-wasm-http",
    type: "service",
    provider: "local-wasm",
    driver: "container",
    match: { envType: "ephemeral", app: "hello-bindle" },
  });

  return {
    catalog,
    capabilitiesByProvider: {
      "local-wasm": [
        defineCapability({ provider: "local-wasm", port: "containerService", features: ["http"] }),
      ],
    },
  };
}

export function createUnsatisfiableRequireRegistry() {
  const catalog = createResourceCatalog({
    id: "unsatisfiable-require-catalog",
    contentHash: "sha256:catalog-unsatisfiable-require-001",
  });

  catalog.register({
    id: "azure-container-http",
    type: "service",
    provider: "azure-container",
    driver: "container",
    match: { envType: "production" },
  });

  return {
    catalog,
    capabilitiesByProvider: {
      "azure-container": [
        defineCapability({ provider: "azure-container", port: "containerService", features: ["http"] }),
      ],
    },
  };
}

export function planManifest(manifest: Record<string, unknown>, config: Record<string, unknown> = {}, registry: Record<string, unknown> = {}) {
  const skeleton = planSkeleton(manifest, config, registry);
  const catalog = (registry.catalog as { snapshot?: () => unknown }) ?? registry;
  const capabilitiesByProvider = registry.capabilitiesByProvider ?? {};
  const objective = (config.objective as string | undefined) ?? "cost";
  const deploymentPlan = skeleton.deploymentPlan;
  const matchEvents: ReturnType<typeof capabilityDecisionToMatchEvent>[] = [];
  const rationale: Array<Record<string, unknown>> = [];
  const matchDecisionIds: string[] = [];

  for (const resourcePlan of deploymentPlan.resources) {
    const manifestResource = manifestResourceFor(manifest, resourcePlan.id);
    const resourceContext = buildResourceContext(config, resourcePlan, manifestResource);
    const portRequests = plannerPortRequests(manifestResource, resourcePlan.id);

    const decision = decideCapabilityNegotiatedDefinition({
      catalog,
      context: resourceContext,
      portRequests,
      capabilitiesByProvider,
      objective,
    });

    if (!decision.ok) {
      const planRejectedEvent = capabilityDecisionToPlanRejectedEvent(decision, {
        deploymentId: deploymentPlan.deploymentId,
        correlationId: `deploy:${deploymentPlan.deploymentId}`,
        causationId: `manifest:${skeleton.sourceManifestHash}`,
      });

      return {
        ok: false as const,
        schema: PLANNER_VERSION,
        reason: decision.reason,
        rejection: decision.rejection,
        planRejectedEvent,
        sourceManifestHash: skeleton.sourceManifestHash,
      };
    }

    resourcePlan.provider = {
      id: decision.winner.provider,
      definitionId: decision.winner.id,
      driver: decision.winner.driver,
    };

    const matchEvent = capabilityDecisionToMatchEvent(decision, {
      id: `match-${resourcePlan.id}`,
      correlationId: `deploy:${deploymentPlan.deploymentId}`,
      causationId: `manifest:${skeleton.sourceManifestHash}`,
    });

    matchEvents.push(matchEvent);
    matchDecisionIds.push(matchEvent.id);
    rationale.push({
      resourceId: resourcePlan.id,
      winner: decision.winner.id,
      provider: decision.winner.provider,
      objective: decision.objective,
      ranking: decision.ranking,
      planWarnings: decision.planWarnings,
    });
  }

  deploymentPlan.meta.rationale = rationale;
  deploymentPlan.meta.provenance.matchDecisionIds = matchDecisionIds;
  deploymentPlan.meta.provenance.catalogContentHash = normalizeCatalogHash(config, registry);

  const plannedEvent = createPlannedEvent(deploymentPlan, {
    tenant: deploymentPlan.resources[0]?.context?.tenant,
    correlationId: `deploy:${deploymentPlan.deploymentId}`,
    causationId: `manifest:${skeleton.sourceManifestHash}`,
  });

  return {
    ok: true as const,
    schema: PLANNER_VERSION,
    deploymentPlan,
    plannedEvent,
    matchEvents,
    sourceManifestHash: skeleton.sourceManifestHash,
    planHash: planContentAddress(deploymentPlan),
  };
}

export function assertPlanManifest(manifest: Record<string, unknown>, config: Record<string, unknown>, registry: Record<string, unknown>) {
  const result = planManifest(manifest, config, registry);
  if (!result.ok) {
    throw new PlannerError(result.rejection?.code ?? "plan.rejected", result.reason);
  }

  const validation = validateDeploymentPlan(result.deploymentPlan);
  if (!validation.ok) {
    throw new PlannerError("deployment-plan.invalid", validation.errors.join("; "));
  }

  const plannedValidation = validateControlPlaneEvent(result.plannedEvent);
  if (!plannedValidation.ok) {
    throw new PlannerError("deployment.planned.invalid", plannedValidation.errors.join("; "));
  }

  for (const matchEvent of result.matchEvents) {
    const matchValidation = validateControlPlaneEvent(matchEvent);
    if (!matchValidation.ok) {
      throw new PlannerError("match.decided.invalid", matchValidation.errors.join("; "));
    }
  }

  return result;
}

export function canonicalPlanJson(plan: Record<string, unknown>) {
  return canonicalJson(plan);
}

function manifestResourceFor(manifest: Record<string, unknown>, resourceId: string) {
  const resources = manifest.resources as Record<string, Record<string, unknown>> | undefined;
  const resource = resources?.[resourceId];
  if (!resource) {
    throw new PlannerError("manifest.resource.missing", `manifest missing resource ${resourceId}`);
  }
  return resource;
}

function buildResourceContext(
  config: Record<string, unknown>,
  resourcePlan: { id: string; context: Record<string, string> },
  manifestResource: Record<string, unknown>,
) {
  const baseContext = (config.context as Record<string, string> | undefined) ?? {};
  const planner = (manifestResource.planner as Record<string, unknown> | undefined) ?? {};

  return {
    deploymentId: (config.deploymentId as string | undefined) ?? `deploy-${baseContext.app ?? "app"}-${baseContext.env ?? "dev"}`,
    resourceType: (planner.resourceType as string | undefined) ?? resourcePlan.context.resourceType,
    envType: baseContext.envType ?? resourcePlan.context.envType,
    env: baseContext.env ?? resourcePlan.context.env,
    app: baseContext.app ?? resourcePlan.context.app,
    tenant: baseContext.tenant ?? resourcePlan.context.tenant,
    resourceClass: (planner.resourceClass as string | undefined) ?? resourcePlan.context.resourceClass ?? "standard",
    resourceId: resourcePlan.id,
  };
}

function plannerPortRequests(manifestResource: Record<string, unknown>, resourceId: string) {
  const planner = manifestResource.planner as Record<string, unknown> | undefined;
  const explicit = planner?.capabilityRequests;
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit.map((request) => capabilityRequest(request));
  }

  const defaults = DEFAULT_CAPABILITY_REQUESTS[resourceId];
  if (defaults) {
    return defaults.map((request) => capabilityRequest(request));
  }

  throw new PlannerError("planner.capability.missing", `no capability requests for resource ${resourceId}`);
}

function normalizeCatalogHash(config: Record<string, unknown>, registry: Record<string, unknown>) {
  const catalog = registry.catalog as { snapshot?: () => { contentHash?: string } } | undefined;
  const value =
    (config.catalogContentHash as string | undefined) ??
    (typeof catalog?.snapshot === "function" ? catalog.snapshot().contentHash : undefined) ??
    (registry.contentHash as string | undefined);

  if (typeof value !== "string" || value.length === 0) {
    return `sha256:${"0".repeat(64)}`;
  }
  return value.startsWith("sha256:") ? value : `sha256:${value}`;
}

const DEFAULT_CAPABILITY_REQUESTS: Record<string, Array<{ port: string; features: string[]; strictness: "require" | "prefer" }>> = {
  "orders-db": [{ port: "database", features: ["managed"], strictness: "require" }],
  "checkout-api": [{ port: "containerService", features: ["http"], strictness: "require" }],
  "web-edge": [{ port: "gateway", features: ["http", "edge"], strictness: "require" }],
  "receipt-worker": [{ port: "queue", features: ["worker"], strictness: "prefer" }],
  service: [{ port: "containerService", features: ["http"], strictness: "require" }],
};
