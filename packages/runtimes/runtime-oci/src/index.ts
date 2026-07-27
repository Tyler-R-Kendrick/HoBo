export {
	createOciRuntimeHost,
	ensureOciRuntime,
	type OciRuntimeHostOptions,
} from "./host.js";
export {
	createKubectlKubernetesClient,
	createProcessKubectlTransport,
	KubectlUnavailableError,
	type KubernetesClient,
	type KubectlKubernetesClientOptions,
	type KubectlProbeResult,
	type KubectlTransport,
	type PortForwardHandle,
} from "./kubernetes-client.js";
export {
	deploymentManifests,
	packWasmAsOci,
	WASM_COMPONENT_MEDIA_TYPE,
	type OciPackResult,
} from "./oci-pack.js";
export {
	ensureKubectlBinary,
	isKubectlPresent,
	kubectlToolsPath,
	PINNED_KUBECTL_VERSION,
	type KubectlBinary,
} from "./kubectl-ensure.js";

// public-contract: package id consumers assert against.
export const HOBO_RUNTIME_OCI_PACKAGE = "@hobo/runtime-oci";
