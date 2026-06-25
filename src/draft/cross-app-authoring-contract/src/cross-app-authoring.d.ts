export type ExternalAuthFlowType =
  | "oauth2-xaa"
  | "oauth2-obo"
  | "mcp-oauth2.1";

export interface ExternalAuthOperation {
  scope: string;
}

export interface ExternalAuthFlow {
  type: ExternalAuthFlowType;
  idJag?: boolean;
  audience?: string;
  scopes?: readonly string[];
  operations?: Record<string, ExternalAuthOperation>;
}

export interface ExternalAuthJson {
  issuer?: string;
  flows: readonly ExternalAuthFlow[];
}

export interface CrossAppCall<Scope extends string = string> {
  readonly target: string;
  readonly operation: string;
  readonly input: unknown;
  readonly scope: Scope;
}

export interface CrossAppBinding<Name extends string = string> {
  readonly name: Name;
  readonly flow: ExternalAuthFlow;
  readonly via: "xaa" | Exclude<ExternalAuthFlowType, "oauth2-xaa">;
  readonly advertisedScopes: readonly string[];
  readonly operationScopes: Readonly<Record<string, string>>;
  readonly declaredAllow?: readonly string[];
  readonly client: Readonly<Record<string, unknown>>;
  allow(...scopes: string[]): CrossAppBinding<Name>;
  call(operation: string, input?: unknown): CrossAppCall;
}

export interface CrossAppManifestEntry {
  readonly type: "external-app.v1";
  readonly via: "xaa" | Exclude<ExternalAuthFlowType, "oauth2-xaa">;
  readonly audience?: string;
  readonly onBehalfOf: "user";
  readonly allow: readonly string[];
  readonly observedScopes: readonly string[];
  readonly declaredAllow?: readonly string[];
  readonly requestedScopeSource: "usage-inferred" | "declared-narrowing";
  readonly usageContract: {
    readonly compareObservedUsage: boolean;
    readonly usageExceedsDeclaredAllow: boolean;
  };
  readonly fallbackFrom?: "oauth2-xaa";
}

export function createCrossAppBinding<Name extends string>(
  name: Name,
  authJson: ExternalAuthJson,
  options?: { declaredAllow?: readonly string[] }
): CrossAppBinding<Name>;

export function buildCrossAppManifestEntry(
  binding: CrossAppBinding,
  observedOperations?: readonly string[]
): CrossAppManifestEntry;

export function generateCrossAppClientDeclaration(binding: CrossAppBinding): string;
export function selectExternalAppFlow(authJson: ExternalAuthJson): ExternalAuthFlow;
