import { readFile } from "node:fs/promises";

export const CDKTF_IMPORT_ONLY_ERROR = "cdktf-import-only";
export const CDKTF_IMPORT_REPORT_VERSION = "hobo.iac-cdktf.import/v1";

const DEFAULT_MAPPINGS = Object.freeze({
  aws_dynamodb_table: { hoboType: "database", capability: "wasi:keyvalue/store" },
  aws_s3_bucket: { hoboType: "objectStore", capability: "wasi:blobstore/container" },
});

const AUTHORING_OPERATIONS = new Set(["create", "update", "replace", "delete"]);

export class CdktfImportOnlyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CdktfImportOnlyError";
    this.code = code;
  }
}

export class CdktfStateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CdktfStateError";
    this.code = code;
  }
}

export async function readTerraformStateFile(fileUrlOrPath) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(fileUrlOrPath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CdktfStateError("malformed-state-json", `malformed CDKTF/Terraform state JSON: ${error.message}`);
    }
    throw error;
  }

  return validateTerraformState(parsed);
}

export function importCdktfState(state, options = {}) {
  const validated = validateTerraformState(state);
  const mappings = { ...DEFAULT_MAPPINGS, ...(options.mappings ?? {}) };
  const resources = [];

  for (const resource of validated.resources) {
    if (resource.mode !== "managed") {
      continue;
    }

    resource.instances.forEach((instance, index) => {
      const attributes = structuredClone(instance.attributes);
      const address = instanceAddress(resource, index);
      const mapping = mappings[resource.type];
      const common = {
        terraformType: resource.type,
        terraformName: resource.name,
        address,
        id: String(attributes.id),
        provider: normalizeProvider(resource.provider),
        attributes,
        provenance: {
          source: "cdktf",
          stateLineage: validated.lineage,
          stateSerial: validated.serial,
          provider: normalizeProvider(resource.provider),
          address,
        },
      };

      if (!mapping) {
        resources.push({
          kind: "external",
          hoboType: "external",
          ...common,
          externalReason: `no HoBo mapping for Terraform resource type ${resource.type}`,
        });
        return;
      }

      resources.push({
        kind: "adopted",
        hoboType: mapping.hoboType,
        capability: mapping.capability,
        ...common,
      });
    });
  }

  return deepFreeze({
    apiVersion: CDKTF_IMPORT_REPORT_VERSION,
    source: "cdktf",
    mode: "import-only",
    resources,
    portabilityReport: {
      nonPortableSurface: resources.map((resource) => ({
        resource: resource.address,
        kind: resource.kind,
        reason:
          resource.kind === "external"
            ? resource.externalReason
            : "brownfield resource adopted from CDKTF/Terraform state",
      })),
    },
  });
}

export function createCdktfImportOnlyProvider() {
  return deepFreeze({
    id: "cdktf",
    mode: "import-only",
    async preview() {
      throw importOnlyError("preview");
    },
    async apply() {
      throw importOnlyError("apply");
    },
    async destroy() {
      throw importOnlyError("destroy");
    },
    async refresh(program = {}) {
      const state =
        program.state ??
        (program.stateFile
          ? await readTerraformStateFile(program.stateFile)
          : undefined);
      if (!state) {
        throw new CdktfStateError("missing-state", "refresh requires state or stateFile");
      }

      const imported = importCdktfState(state, { mappings: program.mappings });

      return deepFreeze({
        kind: "drift-report",
        provider: "cdktf",
        mode: "import-only",
        drifted: false,
        resources: imported.resources,
        portabilityReport: imported.portabilityReport,
      });
    },
  });
}

export function planAdoptedResources(resources, options = {}) {
  const destructive = (options.proposedChanges ?? []).filter((change) =>
    AUTHORING_OPERATIONS.has(change.op),
  );
  if (destructive.length > 0) {
    const ops = [...new Set(destructive.map((change) => change.op))].join(", ");
    const targets = [...new Set(destructive.map((change) => change.resource))].join(", ");
    throw new CdktfImportOnlyError(
      "destructive-import-plan",
      `CDKTF import is drift-detect only: refusing ${ops} for ${targets}`,
    );
  }

  return deepFreeze({
    kind: "iac-plan",
    provider: "cdktf",
    mode: "import-only",
    adoptedResources: resources.map((resource) => ({
      address: resource.address,
      id: resource.id,
      kind: resource.kind,
    })),
    diff: {
      dirty: false,
      changes: [],
      reason: "adopted resources are drift-detect only",
    },
    blockedAuthoringChanges: [],
  });
}

function validateTerraformState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new CdktfStateError("invalid-state", "CDKTF/Terraform state must be an object");
  }
  if (!Array.isArray(state.resources)) {
    throw new CdktfStateError("missing-resources", "CDKTF/Terraform state must contain resources[]");
  }

  for (const resource of state.resources) {
    validateResource(resource);
  }

  return state;
}

function validateResource(resource) {
  if (!resource || typeof resource !== "object") {
    throw new CdktfStateError("invalid-resource", "state resources[] entries must be objects");
  }
  if (typeof resource.type !== "string" || resource.type.length === 0) {
    throw new CdktfStateError("missing-resource-type", "state resource is missing type");
  }
  if (typeof resource.name !== "string" || resource.name.length === 0) {
    throw new CdktfStateError("missing-resource-name", `state resource ${resource.type} is missing name`);
  }
  if (!Array.isArray(resource.instances)) {
    throw new CdktfStateError("missing-resource-instances", `${resource.type}.${resource.name} is missing instances[]`);
  }

  resource.instances.forEach((instance, index) => {
    if (!instance?.attributes || typeof instance.attributes !== "object") {
      throw new CdktfStateError(
        "missing-resource-attributes",
        `${resource.type}.${resource.name} instance ${index} is missing attributes`,
      );
    }
    if (instance.attributes.id === undefined || instance.attributes.id === null || instance.attributes.id === "") {
      throw new CdktfStateError(
        "missing-resource-id",
        `${resource.type}.${resource.name} instance ${index} is missing attributes.id`,
      );
    }
  });
}

function importOnlyError(operation) {
  return new CdktfImportOnlyError(
    CDKTF_IMPORT_ONLY_ERROR,
    `@hobo/iac-cdktf is import-only: ${operation} would author infrastructure`,
  );
}

function instanceAddress(resource, instanceIndex) {
  const base = `${resource.type}.${resource.name}`;
  return resource.instances.length > 1 ? `${base}[${instanceIndex}]` : base;
}

function normalizeProvider(provider = "unknown") {
  const match = String(provider).match(/registry\.terraform\.io\/[^/"\]]+\/[^/"\]]+/);
  return match?.[0] ?? String(provider);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}
