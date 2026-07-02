export type ResourceVerb = string;

export type AllowFacts = {
  declaredAllow?: readonly ResourceVerb[];
  dynamicAllow?: readonly ResourceVerb[];
  dynamicReason?: string;
};

export type ResourceHandle<V extends ResourceVerb = ResourceVerb> = {
  readonly kind: string;
  readonly name: string;
  readonly port: string;
  readonly catalogVerbs: readonly ResourceVerb[];
  readonly facts: AllowFacts;
  allow<const W extends readonly ResourceVerb[]>(
    ...verbs: W
  ): ResourceHandle<W[number]>;
  allow<const W extends readonly ResourceVerb[]>(
    options: { dynamic: true; reason: string },
    ...verbs: W
  ): ResourceHandle<W[number]>;
};

export function createResourceHandle(input: {
  kind: string;
  name: string;
  port: string;
  catalogVerbs: readonly ResourceVerb[];
  facts?: AllowFacts;
}): ResourceHandle {
  const facts: AllowFacts = { ...input.facts };

  function allow<const W extends readonly ResourceVerb[]>(
    ...args:
      | W
      | [{ dynamic: true; reason: string }, ...W]
  ): ResourceHandle<W[number]> {
    if (args.length === 0) {
      throw new TypeError(".allow() requires at least one verb; omit the call instead.");
    }

    const first = args[0];
    if (
      typeof first === "object" &&
      first !== null &&
      "dynamic" in first &&
      first.dynamic === true
    ) {
      const options = first;
      const verbs = args.slice(1) as unknown as W;
      if (verbs.length === 0) {
        throw new TypeError(".allow() requires at least one verb; omit the call instead.");
      }
      if (!options.reason || options.reason.trim().length === 0) {
        throw new TypeError("dynamic .allow() grants require a non-empty reason.");
      }
      return createResourceHandle({
        ...input,
        facts: {
          ...facts,
          dynamicAllow: [...verbs],
          dynamicReason: options.reason,
          declaredAllow: [...verbs],
        },
      }) as ResourceHandle<W[number]>;
    }

    const verbs = args as unknown as W;
    return createResourceHandle({
      ...input,
      facts: {
        ...facts,
        declaredAllow: [...verbs],
      },
    }) as ResourceHandle<W[number]>;
  }

  return {
    kind: input.kind,
    name: input.name,
    port: input.port,
    catalogVerbs: input.catalogVerbs,
    facts,
    allow,
  };
}
