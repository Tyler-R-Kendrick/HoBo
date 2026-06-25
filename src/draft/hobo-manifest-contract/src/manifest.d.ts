export const MANIFEST_SCHEMA: "hobo.manifest/v1";

export interface HoboManifestV1 {
  schema: "hobo.manifest/v1";
  componentHost: ComponentHostPin;
  resources: Record<string, ManifestResource>;
}

export interface ComponentHostPin {
  kind: string;
  version: string;
}

export type ManifestResource =
  | DataResource
  | ComponentResource
  | WebsiteResource;

export interface DataResource extends BaseResource {
  type: "data.v1";
  port: string;
  paradigm?: string;
  allow?: string[];
  connectionString?: string;
}

export interface ComponentResource extends BaseResource {
  type: "component.v1";
  image?: string;
  runtime?: "wasm" | "container";
  exports?: string[];
  links?: ManifestLink[];
  endpoints?: Record<string, ManifestEndpoint>;
  env?: Record<string, string>;
  annotations?: Record<string, unknown>;
}

export interface WebsiteResource extends BaseResource {
  type: "website.v1";
  bind?: string[];
}

export interface BaseResource {
  type: string;
  port?: string;
}

export interface ManifestLink {
  import: string;
  to: string;
}

export interface ManifestEndpoint {
  scheme: string;
  targetPort: number;
  external?: boolean;
}

export interface ManifestValidationResult {
  valid: true;
  schema: "hobo.manifest/v1";
  aspireEnv: Record<string, string[]>;
  hash: string;
}

export interface ManifestReference {
  resourceId: string;
  output: string;
}

export interface ResourceOutputPlaceholder {
  type: string;
  className: string;
  resourceId: string;
  output: string;
}

export interface ContextPlaceholder {
  contextPath: string;
}

export class ManifestValidationError extends Error {
  path: string;
}

export function validateManifest(input: unknown): ManifestValidationResult;
export function parseManifestReference(value: string): ManifestReference;
export function parseOutputPlaceholder(
  value: string,
): ResourceOutputPlaceholder | ContextPlaceholder;
export function canonicalManifestHash(manifest: unknown): string;
