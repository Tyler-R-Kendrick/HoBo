import {
	assertResourceName,
	BindReferenceError,
	type ComponentHandle,
	createComponentHandle,
	normalizeBindMap,
	type ResourceHandle,
} from "./bind-reference.js";

type DependencyRef = string | { readonly name: string };

export function addContainer(
	name: string,
	source: string,
	options: {
		bind?: Readonly<Record<string, ResourceHandle>>;
		env?: Readonly<Record<string, string>>;
	} = {},
): ComponentHandle {
	const handle = createComponentHandle("container", name, {
		image: source,
		...(options.bind !== undefined ? { bind: options.bind } : {}),
		...(options.env !== undefined ? { env: options.env } : {}),
		build: {
			provider: "hobo:build",
			source,
			defaultArtifact: "wasm-on-oci",
		},
	});

	handle.withEndpoint = (endpoint) => {
		const endpointName = endpoint.name ?? "http";
		handle.endpoints[endpointName] = {
			scheme: endpoint.scheme,
			port: endpoint.port,
			targetPort: endpoint.targetPort ?? endpoint.port,
			external: endpoint.external ?? false,
			protocol: endpoint.protocol ?? "tcp",
		};
		return handle;
	};

	handle.withEnvironment = (key, value) => {
		handle.env[key] = value;
		return handle;
	};

	handle.withVolume = (volumeName, target) => {
		const volumes = (handle.annotations.volumes as unknown[] | undefined) ?? [];
		volumes.push({ name: volumeName, target });
		handle.annotations.volumes = volumes;
		return handle;
	};

	handle.withHttpHealthCheck = (path) => {
		handle.annotations.health = { type: "http", path };
		return handle;
	};

	handle.withHttpEndpoint = (port, endpointOptions = {}) =>
		handle.withEndpoint!({
			name: endpointOptions.name ?? "http",
			scheme: "http",
			port,
			...(endpointOptions.targetPort !== undefined
				? { targetPort: endpointOptions.targetPort }
				: {}),
			...(endpointOptions.external !== undefined
				? { external: endpointOptions.external }
				: {}),
			...(endpointOptions.protocol !== undefined
				? { protocol: endpointOptions.protocol }
				: {}),
		});

	handle.withArgs = (...args) => {
		const flat = (handle.annotations.args as unknown[] | undefined) ?? [];
		handle.annotations.args = [...flat, ...args.flat()];
		return handle;
	};

	handle.withBindMount = (mountSource, target, readOnly = false) => {
		const mounts =
			(handle.annotations.bindMounts as unknown[] | undefined) ?? [];
		mounts.push({ source: mountSource, target, readOnly });
		handle.annotations.bindMounts = mounts;
		return handle;
	};

	handle.withLifetime = (lifetime) => {
		if (!["session", "persistent"].includes(lifetime)) {
			throw new BindReferenceError(
				`resources.${name}.lifetime`,
				"lifetime must be one of session, persistent",
			);
		}
		handle.annotations.lifetime = lifetime;
		return handle;
	};

	handle.waitFor = (dependency) => {
		recordWait(handle, name, "waitFor", dependency, "ready");
		return handle;
	};

	handle.waitForCompletion = (dependency) => {
		recordWait(handle, name, "waitForCompletion", dependency, "completed");
		return handle;
	};

	handle.withDnsRecord = () => {
		throw new BindReferenceError(
			`resources.${name}.dns`,
			"DNS is Yard-level and outside the bind reference contract",
		);
	};

	return handle;
}

function recordWait(
	handle: ComponentHandle,
	ownerName: string,
	key: string,
	dependency: DependencyRef,
	until: "ready" | "completed",
): void {
	const target = resolveDependencyName(dependency);
	if (typeof target !== "string" || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(target)) {
		throw new BindReferenceError(
			`resources.${ownerName}.${key}`,
			"must reference a declared resource handle or id",
		);
	}
	const waits = (handle.annotations[key] as unknown[] | undefined) ?? [];
	waits.push({ to: target, until });
	handle.annotations[key] = waits;
}

function resolveDependencyName(dependency: DependencyRef): string | null {
	if (typeof dependency === "string") {
		return dependency;
	}
	if (isRecord(dependency) && typeof dependency.name === "string") {
		return dependency.name;
	}
	return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
