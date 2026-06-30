export declare const KUBERNETES_PROVIDER_ID = "@hobo/provider-kubernetes";
export declare const KUBERNETES_PROVIDER_VERSION = "hobo.provider-kubernetes/v1";
export declare const KUBERNETES_PROVIDER_TARGET = "kubernetes";
export declare const IAC_CROSSPLANE_DRIVER = "@hobo/iac-crossplane";

export type KubernetesSeedCapability = "compute" | "database" | "cache";
export type KubernetesProviderPort = KubernetesSeedCapability | "networking" | "componentHost" | "namespace";

export interface KubernetesOptionBlock<TPort extends KubernetesProviderPort, TOptions extends object> {
  providerId: "kubernetes";
  port: TPort;
  optionName: string;
  negotiation: "prefer" | "require";
  options: TOptions;
}

type NoRaw<T extends object> = T & { rawKubernetesManifest?: never };

export interface KubernetesDeploymentOptions {
  replicas?: number;
  runtimeClassName?: "runc" | "wasmtime";
  cpuMillicores?: number;
  memoryMiB?: number;
}

export interface KubernetesServiceOptions {
  type?: "ClusterIP" | "LoadBalancer";
  port?: number;
}

export interface KubernetesIngressOptions {
  className?: string;
  tls?: boolean;
  host?: string;
}

export interface KubernetesWasmCloudHostOptions {
  replicas?: number;
  nats?: "helm-bundled" | "external";
  lattice?: string;
}

export interface KubernetesPostgresOptions {
  storageGb?: number;
  operator?: "zalando-postgres";
}

export interface KubernetesRedisOptions {
  memoryMiB?: number;
  operator?: "opstree-redis";
}

export interface KubernetesNamespaceOptions {
  enforceRbac?: boolean;
  networkPolicy?: "deny-by-default" | "allow-same-namespace";
}

export interface KubernetesWithBuilders {
  deployment<T extends KubernetesDeploymentOptions = {}>(options?: NoRaw<T>): KubernetesOptionBlock<"compute", Required<Pick<KubernetesDeploymentOptions, "replicas" | "runtimeClassName" | "cpuMillicores" | "memoryMiB">> & T>;
  ingress<T extends KubernetesIngressOptions = {}>(options?: NoRaw<T>): KubernetesOptionBlock<"networking", Required<Pick<KubernetesIngressOptions, "className" | "tls">> & T>;
  namespace<T extends KubernetesNamespaceOptions = {}>(options?: NoRaw<T>): KubernetesOptionBlock<"namespace", Required<Pick<KubernetesNamespaceOptions, "enforceRbac" | "networkPolicy">> & T>;
  postgres<T extends KubernetesPostgresOptions = {}>(options?: NoRaw<T>): KubernetesOptionBlock<"database", Required<Pick<KubernetesPostgresOptions, "storageGb" | "operator">> & T>;
  redis<T extends KubernetesRedisOptions = {}>(options?: NoRaw<T>): KubernetesOptionBlock<"cache", Required<Pick<KubernetesRedisOptions, "memoryMiB" | "operator">> & T>;
  service<T extends KubernetesServiceOptions = {}>(options?: NoRaw<T>): KubernetesOptionBlock<"networking", Required<Pick<KubernetesServiceOptions, "type" | "port">> & T>;
  wasmCloudHost<T extends KubernetesWasmCloudHostOptions = {}>(options?: NoRaw<T>): KubernetesOptionBlock<"componentHost", Required<Pick<KubernetesWasmCloudHostOptions, "replicas" | "nats">> & T>;
}

export declare const kubernetes: {
  with: KubernetesWithBuilders;
};

export interface KubernetesCapabilityManifestEntry {
  port: KubernetesProviderPort;
  service: string;
  resourceClass: string;
  resourceClasses: string[];
  features: string[];
  regions: string[];
  conformance: { tags: string[] };
  driver: typeof IAC_CROSSPLANE_DRIVER;
}

export interface KubernetesProvider {
  id: typeof KUBERNETES_PROVIDER_ID;
  apiVersion: typeof KUBERNETES_PROVIDER_VERSION;
  target: typeof KUBERNETES_PROVIDER_TARGET;
  capabilities: readonly unknown[];
  manifest: { claimedCapabilities: KubernetesSeedCapability[] };
  with: KubernetesWithBuilders;
  registerDefaultDefinitions<T extends unknown[]>(registry: T): T;
  realize(plan: Record<string, unknown>): Record<string, unknown>;
  capabilityManifest(): {
    provider: typeof KUBERNETES_PROVIDER_ID;
    claimedCapabilities: KubernetesSeedCapability[];
    auth: { mode: "svid-federation" };
    runtimeHosts: Array<{ kind: "wasmcloud-operator"; resourceClass: "k8s:wasmcloud-operator" }>;
    networking: { serviceDiscovery: "kubernetes-service-dns" };
    capabilities: KubernetesCapabilityManifestEntry[];
  };
  client(port: "compute", outputs: Record<string, unknown>): KubernetesComputeClient;
  client(port: "database", outputs: Record<string, unknown>): KubernetesDatabaseClient;
  client(port: "cache", outputs: Record<string, unknown>): KubernetesCacheClient;
}

export interface KubernetesComputeClient {
  port: "compute";
  providerId: typeof KUBERNETES_PROVIDER_ID;
  url: string;
  serviceName: unknown;
  ping(): "compute:ok";
  describe(): Record<string, unknown>;
}

export interface KubernetesDatabaseClient {
  port: "database";
  providerId: typeof KUBERNETES_PROVIDER_ID;
  connectionString: string;
  ping(): "database:ok";
  describe(): Record<string, unknown>;
}

export interface KubernetesCacheClient {
  port: "cache";
  providerId: typeof KUBERNETES_PROVIDER_ID;
  endpoint: unknown;
  ping(): "cache:ok";
  describe(): Record<string, unknown>;
}

export declare function createKubernetesProvider(options?: {
  cluster?: {
    name?: string;
    installedCrds?: string[];
    namespaces?: Record<string, { tenant: string }>;
  };
  campEvidence?: "pass" | "fail" | Record<string, Partial<Record<"realProviderDrift" | "iam" | "mtls" | "quota", boolean>>>;
}): KubernetesProvider;

export declare function createKubernetesClusterFixturePlan(options?: Record<string, unknown>): Record<string, unknown>;
export declare function mergeKubernetesResolvedOptions(provider: KubernetesProvider, optionBlocks: readonly unknown[]): Record<string, unknown>;
export declare function evaluateKubernetesPlan(provider: KubernetesProvider, plan: Record<string, unknown>): Record<string, unknown>;
export declare function realizeKubernetesPlan(provider: KubernetesProvider, plan: Record<string, unknown>): Record<string, unknown>;
export declare function simulateKubernetesApply(provider: KubernetesProvider, plan: Record<string, unknown>, options?: Record<string, unknown>): Record<string, unknown>;
