import type {
	BindleBuilder,
	BindleConnectorRecord,
	ConnectorBinding,
	ConnectorDefinition,
} from "./types.js";

const CONNECTOR_REGISTRY = Symbol.for("hobo.connector.registry/v1");

type ConnectorRegistry = Map<symbol, ConnectorDefinition>;
type BuilderConnectorRegistry = Map<string, ConnectorBinding>;

function registry(): ConnectorRegistry {
	const root = globalThis as typeof globalThis & {
		[CONNECTOR_REGISTRY]?: ConnectorRegistry;
	};
	root[CONNECTOR_REGISTRY] ??= new Map();
	return root[CONNECTOR_REGISTRY];
}

/**
 * Opaque package-exported connector symbol. The generic is compile-time only;
 * runtime metadata stays in the process-wide connector registry so connector
 * packages do not have to wrap or replace their vendor SDK.
 */
export type ConnectorSymbol<D extends ConnectorDefinition = ConnectorDefinition> =
	symbol & { readonly __hoboConnectorDefinition?: D };

/** Connector-package authoring helper. */
export function defineConnector<const D extends ConnectorDefinition>(
	definition: D,
): ConnectorSymbol<D> {
	if (definition.kind !== "connector-definition") {
		throw new TypeError("connector definition must use kind connector-definition");
	}
	if (!definition.id || !definition.origin) {
		throw new TypeError("connector definition requires id and origin");
	}
	const symbol = Symbol.for(`hobo.connector/${definition.id}`) as ConnectorSymbol<D>;
	registry().set(symbol, Object.freeze({ ...definition }));
	return symbol;
}

export function connectorDefinition<D extends ConnectorDefinition>(
	symbol: ConnectorSymbol<D>,
): D {
	const definition = registry().get(symbol);
	if (!definition) {
		throw new Error(
			"unknown connector symbol; import the package that defines it before declaring the Bindle",
		);
	}
	return definition as D;
}

function createBinding<D extends ConnectorDefinition>(
	definition: D,
): ConnectorBinding<D> {
	const declaredAllow: string[] = [];
	const make = (allow: readonly string[]): ConnectorBinding<D> =>
		Object.freeze({
			kind: "connector" as const,
			definition,
			declaredAllow: Object.freeze([...allow]) as ConnectorBinding<D>["declaredAllow"],
			allow: (...capabilities) => {
				for (const capability of capabilities) {
					if (!definition.capabilities.includes(capability)) {
						throw new Error(
							`connector ${definition.id} does not advertise capability ${String(capability)}`,
						);
					}
				}
				return make(capabilities);
			},
		});
	return make(declaredAllow);
}

const builderBindings = new WeakMap<object, BuilderConnectorRegistry>();

/** Internal Bindle-builder hook; public app authors only call b.connector(...). */
export function withConnectorDeclarations<T extends object>(base: T): T & BindleBuilder {
	const bindings: BuilderConnectorRegistry = new Map();
	const builder = {
		...base,
		connector<D extends ConnectorDefinition>(symbol: ConnectorSymbol<D>) {
			const definition = connectorDefinition(symbol);
			const binding = createBinding(definition);
			bindings.set(definition.id, binding);
			return binding;
		},
	} as T & BindleBuilder;
	builderBindings.set(builder, bindings);
	return builder;
}

export function connectorRecordsForBuilder(
	builder: object,
): Readonly<Record<string, BindleConnectorRecord>> {
	const records: Record<string, BindleConnectorRecord> = {};
	for (const [name, binding] of builderBindings.get(builder) ?? []) {
		const definition = binding.definition;
		records[name] = Object.freeze({
			kind: "connector",
			name,
			target: definition.id,
			origin: definition.origin,
			auth: definition.auth,
			...(definition.audience ? { audience: definition.audience } : {}),
			allow: Object.freeze([...binding.declaredAllow]),
		});
	}
	return Object.freeze(records);
}

declare module "./types.js" {
	interface BindleBuilder {
		connector<D extends ConnectorDefinition>(symbol: ConnectorSymbol<D>): ConnectorBinding<D>;
	}
}
