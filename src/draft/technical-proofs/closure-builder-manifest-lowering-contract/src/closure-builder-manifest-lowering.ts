import { createHash } from "node:crypto";

export type ClosureBuilderResourceKind = "api" | "cache" | "queue";
export type ClosureBuilderRelationshipVerb = "dependsOn";

export interface ClosureBuilderLoweringResource {
  readonly generatedId: string;
  readonly kind: ClosureBuilderResourceKind;
  readonly workload?: ClosureBuilderWorkloadDescriptor | null;
  readonly annotations?: readonly ProviderAnnotation[];
}

export interface ClosureBuilderWorkloadDescriptor {
  readonly kind: "inert-workload-factory";
  readonly entrypoint?: string;
}

export interface ProviderAnnotation {
  readonly provider: string;
  readonly option: string;
  readonly value: unknown;
}

export interface ClosureBuilderAlias {
  readonly alias: string;
  readonly generatedId: string;
}

export interface ClosureBuilderRelationship {
  readonly from: string;
  readonly to: string;
  readonly verb: ClosureBuilderRelationshipVerb;
}

export interface ClosureBuilderLoweringInput {
  readonly bindleName: string;
  readonly resources: readonly ClosureBuilderLoweringResource[];
  readonly aliases: readonly ClosureBuilderAlias[];
  readonly relationships: readonly ClosureBuilderRelationship[];
  readonly requiresSameKindIdentityLedger?: boolean;
}

export interface ManifestResource {
  readonly kind: ClosureBuilderResourceKind;
  readonly type: string;
  readonly port: string;
  readonly workload?: ClosureBuilderWorkloadDescriptor;
  readonly links?: readonly ManifestRelationshipFacet[];
  readonly providerOptions?: readonly ProviderAnnotation[];
}

export interface ManifestRelationshipFacet {
  readonly to: string;
  readonly relationship: ClosureBuilderRelationshipVerb;
}

export interface ClosureBuilderManifest {
  readonly schema: "hobo.manifest/v1";
  readonly bindle: string;
  readonly resources: Readonly<Record<string, ManifestResource>>;
  readonly relationships: readonly ClosureBuilderRelationship[];
  readonly authoringAliases: Readonly<Record<string, string>>;
}

export interface WitCall {
  readonly interface: string;
  readonly function: string;
  readonly args: Readonly<Record<string, unknown>>;
}

export interface ClosureBuilderLoweringResult {
  readonly witCalls: readonly WitCall[];
  readonly manifest: ClosureBuilderManifest;
  readonly manifestJson: string;
  readonly manifestHash: string;
}

export interface ClosureBuilderLoweringFixture {
  readonly name: string;
  readonly input: ClosureBuilderLoweringInput;
  readonly expectedWitCalls: readonly WitCall[];
  readonly expectedManifest: ClosureBuilderManifest;
}

export class ClosureBuilderLoweringError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: string, message: string, details: Readonly<Record<string, unknown>> = {}) {
    super(`${code}: ${message}`);
    this.name = "ClosureBuilderLoweringError";
    this.code = code;
    this.details = details;
  }
}

export const CLOSURE_BUILDER_LOWERING_CORPUS_PATH =
  "src/draft/technical-proofs/closure-builder-manifest-lowering-contract/src/closure-builder-manifest-lowering.ts#CLOSURE_BUILDER_LOWERING_CORPUS";

const SHOP_LOWERING_INPUT: ClosureBuilderLoweringInput = Object.freeze({
  bindleName: "shop",
  resources: Object.freeze([
    Object.freeze({ generatedId: "res_0001", kind: "cache" }),
    Object.freeze({
      generatedId: "res_0002",
      kind: "api",
      workload: Object.freeze({
        kind: "inert-workload-factory",
        entrypoint: "myApi.run",
      }),
      annotations: Object.freeze([
        Object.freeze({
          provider: "aws",
          option: "fargate",
          value: Object.freeze({ cpu: 512 }),
        }),
      ]),
    }),
    Object.freeze({ generatedId: "res_0003", kind: "queue" }),
  ]),
  aliases: Object.freeze([
    Object.freeze({ alias: "cache", generatedId: "res_0001" }),
    Object.freeze({ alias: "api", generatedId: "res_0002" }),
    Object.freeze({ alias: "jobs", generatedId: "res_0003" }),
  ]),
  relationships: Object.freeze([
    Object.freeze({ from: "res_0002", to: "res_0001", verb: "dependsOn" }),
    Object.freeze({ from: "res_0002", to: "res_0003", verb: "dependsOn" }),
  ]),
});

export const CLOSURE_BUILDER_LOWERING_CORPUS: readonly ClosureBuilderLoweringFixture[] =
  Object.freeze([
    Object.freeze({
      name: "shop-cache-api-queue",
      input: SHOP_LOWERING_INPUT,
      expectedWitCalls: Object.freeze([
        Object.freeze({
          interface: "hobo:sdk/resource-catalog",
          function: "declare-resource",
          args: Object.freeze({
            generatedId: "res_0001",
            kind: "cache",
            manifestType: "kv.v1",
            port: "wasi:keyvalue",
          }),
        }),
        Object.freeze({
          interface: "hobo:sdk/resource-catalog",
          function: "declare-resource",
          args: Object.freeze({
            generatedId: "res_0002",
            kind: "api",
            manifestType: "component.v1",
            port: "wasi:http",
          }),
        }),
        Object.freeze({
          interface: "hobo:sdk/workloads",
          function: "record-inert-workload",
          args: Object.freeze({
            generatedId: "res_0002",
            kind: "inert-workload-factory",
            entrypoint: "myApi.run",
          }),
        }),
        Object.freeze({
          interface: "hobo:sdk/provider-options",
          function: "annotate-provider-option",
          args: Object.freeze({
            generatedId: "res_0002",
            provider: "aws",
            option: "fargate",
            value: Object.freeze({ cpu: 512 }),
          }),
        }),
        Object.freeze({
          interface: "hobo:sdk/resource-catalog",
          function: "declare-resource",
          args: Object.freeze({
            generatedId: "res_0003",
            kind: "queue",
            manifestType: "queue.v1",
            port: "hobo:queue",
          }),
        }),
        Object.freeze({
          interface: "hobo:sdk/resource-catalog",
          function: "bind-resource",
          args: Object.freeze({
            from: "res_0002",
            to: "res_0001",
            relationship: "dependsOn",
          }),
        }),
        Object.freeze({
          interface: "hobo:sdk/resource-catalog",
          function: "bind-resource",
          args: Object.freeze({
            from: "res_0002",
            to: "res_0003",
            relationship: "dependsOn",
          }),
        }),
        Object.freeze({
          interface: "hobo:sdk/authoring-aliases",
          function: "record-alias",
          args: Object.freeze({ alias: "api", generatedId: "res_0002" }),
        }),
        Object.freeze({
          interface: "hobo:sdk/authoring-aliases",
          function: "record-alias",
          args: Object.freeze({ alias: "cache", generatedId: "res_0001" }),
        }),
        Object.freeze({
          interface: "hobo:sdk/authoring-aliases",
          function: "record-alias",
          args: Object.freeze({ alias: "jobs", generatedId: "res_0003" }),
        }),
      ]),
      expectedManifest: Object.freeze({
        schema: "hobo.manifest/v1",
        bindle: "shop",
        resources: Object.freeze({
          res_0001: Object.freeze({
            kind: "cache",
            type: "kv.v1",
            port: "wasi:keyvalue",
          }),
          res_0002: Object.freeze({
            kind: "api",
            type: "component.v1",
            port: "wasi:http",
            workload: Object.freeze({
              kind: "inert-workload-factory",
              entrypoint: "myApi.run",
            }),
            links: Object.freeze([
              Object.freeze({ to: "res_0001", relationship: "dependsOn" }),
              Object.freeze({ to: "res_0003", relationship: "dependsOn" }),
            ]),
            providerOptions: Object.freeze([
              Object.freeze({
                provider: "aws",
                option: "fargate",
                value: Object.freeze({ cpu: 512 }),
              }),
            ]),
          }),
          res_0003: Object.freeze({
            kind: "queue",
            type: "queue.v1",
            port: "hobo:queue",
          }),
        }),
        relationships: Object.freeze([
          Object.freeze({ from: "res_0002", to: "res_0001", verb: "dependsOn" }),
          Object.freeze({ from: "res_0002", to: "res_0003", verb: "dependsOn" }),
        ]),
        authoringAliases: Object.freeze({
          api: "res_0002",
          cache: "res_0001",
          jobs: "res_0003",
        }),
      }),
    }),
  ]);

export function lowerClosureBuilderGraph(
  input: ClosureBuilderLoweringInput,
): ClosureBuilderLoweringResult {
  const parsed = parseClosureBuilderLoweringInput(input);
  const resources = Object.fromEntries(
    parsed.resources.map((resource) => [resource.generatedId, lowerResource(resource, parsed)]),
  );
  const authoringAliases = Object.fromEntries(
    [...parsed.aliases]
      .sort((left, right) => left.alias.localeCompare(right.alias))
      .map((alias) => [alias.alias, alias.generatedId]),
  );
  const relationships = [...parsed.relationships].sort(compareRelationships);
  const manifest: ClosureBuilderManifest = {
    schema: "hobo.manifest/v1",
    bindle: parsed.bindleName,
    resources,
    relationships,
    authoringAliases,
  };
  const witCalls = [
    ...parsed.resources.flatMap((resource) => resourceWitCalls(resource)),
    ...relationships.map((relationship) => ({
      interface: "hobo:sdk/resource-catalog",
      function: "bind-resource",
      args: {
        from: relationship.from,
        to: relationship.to,
        relationship: relationship.verb,
      },
    })),
    ...Object.entries(authoringAliases).map(([alias, generatedId]) => ({
      interface: "hobo:sdk/authoring-aliases",
      function: "record-alias",
      args: { alias, generatedId },
    })),
  ];
  const manifestJson = canonicalJson(manifest);

  return {
    witCalls,
    manifest,
    manifestJson,
    manifestHash: `sha256:${sha256(manifestJson)}`,
  };
}

export function runClosureBuilderLoweringConformance(
  corpus: readonly ClosureBuilderLoweringFixture[],
  options: { corpusPath?: string } = {},
) {
  const cases = corpus.map((fixture) => {
    const result = lowerClosureBuilderGraph(fixture.input);
    const status =
      canonicalJson(result.witCalls) === canonicalJson(fixture.expectedWitCalls) &&
      result.manifestJson === canonicalJson(fixture.expectedManifest)
        ? "passed"
        : "failed";

    return { name: fixture.name, status };
  });

  return {
    suite: "@hobo/conformance/sdk/closure-builder-lowering",
    corpusPath: options.corpusPath ?? CLOSURE_BUILDER_LOWERING_CORPUS_PATH,
    status: cases.every((entry) => entry.status === "passed") ? "passed" : "failed",
    cases,
  };
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function parseClosureBuilderLoweringInput(
  input: ClosureBuilderLoweringInput,
): ClosureBuilderLoweringInput {
  if (!input.bindleName?.trim()) {
    throw new ClosureBuilderLoweringError(
      "CLOSURE_LOWERING_BINDLE_NAME",
      "bindleName must be non-empty",
    );
  }
  if (input.requiresSameKindIdentityLedger) {
    throw new ClosureBuilderLoweringError(
      "CLOSURE_LOWERING_IDENTITY_LEDGER_REQUIRED",
      "same-kind anonymous insertion stability belongs to HOBO-538 before lowering may depend on it",
      { issue: "HOBO-538" },
    );
  }

  const resources = [...(input.resources ?? [])].sort((left, right) =>
    left.generatedId.localeCompare(right.generatedId),
  );
  const ids = new Set<string>();

  for (const resource of resources) {
    if (!isGeneratedResourceId(resource.generatedId, resource.kind)) {
      throw new ClosureBuilderLoweringError(
        "CLOSURE_LOWERING_RESOURCE_ID",
        "generated resource IDs must be stable res_0000 or res_kind_0000 identifiers",
        { generatedId: resource.generatedId },
      );
    }
    if (ids.has(resource.generatedId)) {
      throw new ClosureBuilderLoweringError(
        "CLOSURE_LOWERING_DUPLICATE_RESOURCE_ID",
        "generated resource IDs must be unique",
        { generatedId: resource.generatedId },
      );
    }
    ids.add(resource.generatedId);
  }

  const aliasNames = new Set<string>();
  for (const alias of input.aliases ?? []) {
    if (!/^[a-z][A-Za-z0-9]*$/u.test(alias.alias)) {
      throw new ClosureBuilderLoweringError(
        "CLOSURE_LOWERING_ALIAS",
        "aliases must be TypeScript-friendly authoring names",
        { alias: alias.alias },
      );
    }
    if (aliasNames.has(alias.alias)) {
      throw new ClosureBuilderLoweringError(
        "CLOSURE_LOWERING_DUPLICATE_ALIAS",
        "aliases must be unique so authoring names cannot overwrite identity metadata",
        { alias: alias.alias },
      );
    }
    aliasNames.add(alias.alias);
    if (!ids.has(alias.generatedId)) {
      throw new ClosureBuilderLoweringError(
        "CLOSURE_LOWERING_ALIAS_TARGET",
        "aliases must target generated resources captured by the closure builder",
        { alias: alias.alias, generatedId: alias.generatedId },
      );
    }
  }

  for (const relationship of input.relationships ?? []) {
    if (relationship.verb !== "dependsOn") {
      throw new ClosureBuilderLoweringError(
        "CLOSURE_LOWERING_RELATIONSHIP_VERB",
        "dependsOn is the only closure-builder v1 relationship verb",
        { verb: relationship.verb },
      );
    }
    if (!ids.has(relationship.from) || !ids.has(relationship.to)) {
      throw new ClosureBuilderLoweringError(
        "CLOSURE_LOWERING_RELATIONSHIP_TARGET",
        "relationships must reference generated resources captured by the closure builder",
        { ...relationship },
      );
    }
  }

  return {
    ...input,
    resources,
    aliases: [...(input.aliases ?? [])],
    relationships: [...(input.relationships ?? [])],
  };
}

function isGeneratedResourceId(generatedId: string, kind: ClosureBuilderResourceKind): boolean {
  return /^res_[0-9]{4}$/u.test(generatedId) || generatedId === generatedIdForKind(kind, generatedId);
}

function generatedIdForKind(kind: ClosureBuilderResourceKind, generatedId: string): string {
  const match = /^res_(?:api|cache|queue)_([0-9]{4})$/u.exec(generatedId);
  return match ? `res_${kind}_${match[1]}` : "";
}

function lowerResource(
  resource: ClosureBuilderLoweringResource,
  input: ClosureBuilderLoweringInput,
): ManifestResource {
  const lowered = resourceShape(resource);
  const links = input.relationships
    .filter((relationship) => relationship.from === resource.generatedId)
    .sort(compareRelationships)
    .map((relationship) => ({
      to: relationship.to,
      relationship: relationship.verb,
    }));
  const providerOptions = sortProviderOptions(resource.annotations ?? []);

  return stripUndefined({
    ...lowered,
    workload: resource.workload ? sanitizeWorkload(resource.workload) : undefined,
    links: links.length > 0 ? links : undefined,
    providerOptions: providerOptions.length > 0 ? providerOptions : undefined,
  });
}

function resourceWitCalls(resource: ClosureBuilderLoweringResource): WitCall[] {
  const shape = resourceShape(resource);
  const calls: WitCall[] = [
    {
      interface: "hobo:sdk/resource-catalog",
      function: "declare-resource",
      args: {
        generatedId: resource.generatedId,
        kind: resource.kind,
        manifestType: shape.type,
        port: shape.port,
      },
    },
  ];

  if (resource.workload) {
    calls.push({
      interface: "hobo:sdk/workloads",
      function: "record-inert-workload",
      args: {
        generatedId: resource.generatedId,
        ...sanitizeWorkload(resource.workload),
      },
    });
  }

  for (const annotation of sortProviderOptions(resource.annotations ?? [])) {
    calls.push({
      interface: "hobo:sdk/provider-options",
      function: "annotate-provider-option",
      args: {
        generatedId: resource.generatedId,
        ...annotation,
      },
    });
  }

  return calls;
}

function resourceShape(resource: ClosureBuilderLoweringResource) {
  if (resource.kind === "api") {
    return { kind: resource.kind, type: "component.v1", port: "wasi:http" };
  }
  if (resource.kind === "cache") {
    return { kind: resource.kind, type: "kv.v1", port: "wasi:keyvalue" };
  }
  return { kind: resource.kind, type: "queue.v1", port: "hobo:queue" };
}

function sanitizeWorkload(workload: ClosureBuilderWorkloadDescriptor): ClosureBuilderWorkloadDescriptor {
  return stripUndefined({
    kind: workload.kind,
    entrypoint: workload.entrypoint,
  });
}

function sortProviderOptions(options: readonly ProviderAnnotation[]): ProviderAnnotation[] {
  return [...options]
    .map((option) => ({
      provider: option.provider,
      option: option.option,
      value: option.value,
    }))
    .sort(
      (left, right) =>
        left.provider.localeCompare(right.provider) ||
        left.option.localeCompare(right.option),
    );
}

function compareRelationships(
  left: ClosureBuilderRelationship,
  right: ClosureBuilderRelationship,
): number {
  return left.from.localeCompare(right.from) || left.to.localeCompare(right.to);
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]),
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
