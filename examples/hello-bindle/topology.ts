import {
	addContainer,
	compileBindleManifest,
	data,
	service,
	type WiringManifest,
} from "@hobo/bindles/wiring";
import { bindleScope, descriptorFromHandle } from "@hobo/bindles/topology";
import { camp, providerSelection } from "@hobo/camps";
import type { Camp } from "@hobo/camps";
import { yard } from "@hobo/yards";
import type { Yard } from "@hobo/yards";

export const LOCAL_RUNTIME = Object.freeze({ kind: "runtime", id: "runtime-local" });

export function buildHelloBindleManifest(): WiringManifest {
	const db = data("db", { paradigm: "relational" });
	const api = service("api", {
		image: "oci://registry.example.com/hello-api@sha256:demo",
		bind: { db },
	});
	const worker = addContainer("worker", "ghcr.io/acme/hello-worker:1", { bind: { db } })
		.withHttpEndpoint!(8080)
		.withEnvironment!("LOG_LEVEL", "debug");

	return compileBindleManifest([db, api, worker]);
}

export function buildHelloBindleTopology(): {
	readonly manifest: WiringManifest;
	readonly bindle: ReturnType<typeof bindleScope>;
	readonly devCamp: Camp;
	readonly localYard: Yard;
} {
	const db = data("db", { paradigm: "relational" });
	const api = service("api", {
		image: "oci://registry.example.com/hello-api@sha256:demo",
		bind: { db },
	});
	const worker = addContainer("worker", "ghcr.io/acme/hello-worker:1", { bind: { db } })
		.withHttpEndpoint!(8080)
		.withEnvironment!("LOG_LEVEL", "debug");

	const manifest = compileBindleManifest([db, api, worker]);

	const appBindle = bindleScope("hello-bindle", (collector) => {
		collector.use(descriptorFromHandle(db));
		collector.use(descriptorFromHandle(api));
		collector.use({
			kind: "container",
			name: worker.name,
			stableId: `container:${worker.name}`,
			portRef: ["wasi:http"],
		});
	});

	const devCamp = camp("dev", {
		runtime: LOCAL_RUNTIME,
		defaultProvider: providerSelection("local"),
		bindle: appBindle,
	});

	const localYard = yard("local", { camps: [devCamp] });

	return { manifest, bindle: appBindle, devCamp, localYard };
}
